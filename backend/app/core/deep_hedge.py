"""
deep_hedge.py — Deep hedging of a short option under proportional transaction costs and
jumps, trained in pure numpy (no deep-learning framework needed on the server).

A dealer is short one European option (premium = Black-Scholes price at the hedging vol)
and trades the underlying at proportional cost c. Hedged P&L on a path:
    PnL = p0 − payoff(S_T) + Σ_t δ_t (S_{t+1} − S_t) − c Σ_t |δ_t − δ_{t−1}| S_t ,  δ_{−1} = 0.
The hedge is chosen to minimise the expected shortfall of the loss, CVaR_α(−PnL)
(Buehler, Gonon, Teichmann & Wood 2019, "Deep hedging", Quantitative Finance 19(8)).

Strategies compared on the same out-of-sample paths
  No hedge        — δ ≡ 0.
  BS delta        — rebalance to the Black-Scholes delta every step.
  Whalley-Wilmott — asymptotically optimal no-trade band Δ ± (3/2 · c S Γ² / γ)^{1/3}
                    (Whalley & Wilmott 1997), risk aversion γ tuned on the training set.
  Deep NTB        — No-Transaction-Band network (Imaki, Imajo, Ito, Minami & Nakagawa 2021,
                    arXiv:2103.01775): an MLP of (moneyness, time, vol) outputs a band
                    [Δ − w_l, Δ + w_u]; the position is the previous one clamped to the band.
                    Trained by back-propagation through time (the clamp makes BPTT a scalar
                    recursion).
  Deep FF         — feed-forward deep hedge δ = Δ + MLP(·): no memory of the position, so it
                    cannot learn a no-trade region — the failure mode reported in recent work.
The network is trained on one market model and can be tested on another (regime fragility).
"""

import numpy as np
from scipy.stats import norm


# ─── market simulation (normalised: S0 = 1) ──────────────────────────────────

def simulate(n_paths, n_steps, T, sigma, rng, jump=None):
    dt = T / n_steps
    z = rng.standard_normal((n_paths, n_steps))
    drift = -0.5 * sigma ** 2 * dt
    jumps = 0.0
    if jump and jump.get("lambda", 0) > 0:
        lam, mj, sj = jump["lambda"], jump["mean"], jump["sd"]
        drift -= lam * (np.exp(mj + 0.5 * sj ** 2) - 1) * dt
        n = rng.poisson(lam * dt, (n_paths, n_steps))
        jumps = n * mj + np.sqrt(n) * sj * rng.standard_normal((n_paths, n_steps))
    x = np.cumsum(drift + sigma * np.sqrt(dt) * z + jumps, axis=1)
    return np.exp(np.c_[np.zeros(n_paths), x])            # (P, N+1), martingale (r = 0)


def bs_call(S, K, tau, sigma):
    tau = np.maximum(tau, 1e-12)
    sq = sigma * np.sqrt(tau)
    d1 = (np.log(S / K) + 0.5 * sq ** 2) / sq
    return S * norm.cdf(d1) - K * norm.cdf(d1 - sq), norm.cdf(d1), norm.pdf(d1) / (S * sq)


def features(S, K, T, sigma, n_steps):
    """Per-step inputs (P, N, 3) and BS delta / gamma (P, N) on the hedging dates."""
    tau = T - np.arange(n_steps) * T / n_steps
    St = S[:, :-1]
    _, delta, gamma = bs_call(St, K, tau[None, :], sigma)
    m = np.log(St / K) / (sigma * np.sqrt(T))
    X = np.stack([m, np.broadcast_to(np.sqrt(tau / T), m.shape), np.full_like(m, sigma)], axis=-1)
    return X, delta, gamma, tau


# ─── P&L and its gradient ────────────────────────────────────────────────────

def pnl(S, delta_path, K, cost, p0, is_call=True):
    dS = np.diff(S, axis=1)
    prev = np.c_[np.zeros(len(S)), delta_path[:, :-1]]
    trade = np.abs(delta_path - prev)
    pay = np.maximum(S[:, -1] - K, 0) if is_call else np.maximum(K - S[:, -1], 0)
    tc = cost * (trade * S[:, :-1]).sum(axis=1)
    return p0 - pay + (delta_path * dS).sum(axis=1) - tc, trade.sum(axis=1), tc


def _direct_grad(S, d, cost):
    """∂PnL/∂δ_t holding the other δ fixed (gains + the two cost terms touching δ_t)."""
    dS = np.diff(S, axis=1)
    prev = np.c_[np.zeros(len(S)), d[:, :-1]]
    nxt = np.c_[d[:, 1:], d[:, -1:]]
    g = dS - cost * S[:, :-1] * np.sign(d - prev)
    g[:, :-1] += cost * S[:, 1:-1] * np.sign(nxt[:, :-1] - d[:, :-1])
    return g


def cvar(loss, alpha):
    q = np.quantile(loss, alpha)
    tail = loss[loss >= q]
    return float(tail.mean()), q


# ─── a small MLP with Adam (numpy) ───────────────────────────────────────────

class MLP:
    def __init__(self, sizes, rng, out_bias=0.0, out_scale=0.1):
        self.W, self.b = [], []
        for i, (a, c) in enumerate(zip(sizes[:-1], sizes[1:])):
            s = np.sqrt(1 / a) * (out_scale if i == len(sizes) - 2 else 1)
            self.W.append(rng.normal(0, s, (a, c)))
            self.b.append(np.full(c, out_bias if i == len(sizes) - 2 else 0.0))
        self.m = [np.zeros_like(p) for p in self.W + self.b]
        self.v = [np.zeros_like(p) for p in self.W + self.b]
        self.k = 0

    def forward(self, X):
        self.acts = [X]
        h = X
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            h = h @ W + b
            if i < len(self.W) - 1:
                h = np.tanh(h)
            self.acts.append(h)
        return h

    def backward(self, grad_out):
        """grad_out = ∂L/∂output (rows × out). Returns parameter gradients."""
        gW, gb = [None] * len(self.W), [None] * len(self.b)
        g = grad_out
        for i in reversed(range(len(self.W))):
            a_in = self.acts[i]
            gW[i] = a_in.T @ g
            gb[i] = g.sum(axis=0)
            if i > 0:
                g = (g @ self.W[i].T) * (1 - self.acts[i] ** 2)
        return gW + gb

    def step(self, grads, lr=3e-3, b1=0.9, b2=0.999, eps=1e-8):
        self.k += 1
        params = self.W + self.b
        for j, (p, g) in enumerate(zip(params, grads)):
            self.m[j] = b1 * self.m[j] + (1 - b1) * g
            self.v[j] = b2 * self.v[j] + (1 - b2) * g * g
            mh = self.m[j] / (1 - b1 ** self.k)
            vh = self.v[j] / (1 - b2 ** self.k)
            p -= lr * mh / (np.sqrt(vh) + eps)


def softplus(z):
    return np.logaddexp(0, z)


def ntb_positions(net, X, delta):
    """Forward pass of the No-Transaction-Band net. Returns positions and what BPTT needs."""
    P, N, _ = X.shape
    z = net.forward(X.reshape(-1, 3)).reshape(P, N, 2)
    lo = delta - softplus(z[..., 0])
    hi = delta + softplus(z[..., 1])
    d = np.empty((P, N))
    prev = np.zeros(P)
    below, above = np.empty((P, N), bool), np.empty((P, N), bool)
    for t in range(N):
        below[:, t], above[:, t] = prev < lo[:, t], prev > hi[:, t]
        prev = np.clip(prev, lo[:, t], hi[:, t])
        d[:, t] = prev
    return d, z, below, above


def ntb_grad(net, S, X, delta, K, cost, p0, w, fwd=None):
    """
    PnL per path and ∂(Σ_p w_p·PnL_p)/∂θ for the NTB net, by back-propagation through time.
    G_t = ∂PnL/∂δ_t (total) = g_t + G_{t+1}·1{δ_t inside band_{t+1}}; the clamp passes the
    gradient to the lower edge when δ_{t−1} < lo_t and to the upper edge when δ_{t−1} > hi_t.
    """
    # fwd: a forward pass already run on X (the net keeps its activations), to avoid a second one.
    d, z, below, above = fwd if fwd is not None else ntb_positions(net, X, delta)
    pl, _, _ = pnl(S, d, K, cost, p0)
    g = _direct_grad(S, d, cost)
    n_steps = d.shape[1]
    G = np.empty_like(d)
    G[:, -1] = g[:, -1]
    for t in range(n_steps - 2, -1, -1):
        inside = ~(below[:, t + 1] | above[:, t + 1])
        G[:, t] = g[:, t] + G[:, t + 1] * inside
    up = G * w[:, None]
    sig = lambda v: 1 / (1 + np.exp(-v))
    gz = np.stack([-up * below * sig(z[..., 0]), up * above * sig(z[..., 1])], axis=-1)
    return pl, net.backward(gz.reshape(-1, 2))


def train_ntb(S, K, T, sigma, cost, p0, n_steps, alpha=0.95, iters=250, batch=1024, seed=0, hidden=24):
    rng = np.random.default_rng(seed)
    net = MLP([3, hidden, hidden, 2], rng, out_bias=-3.0)
    X, delta, _, _ = features(S, K, T, sigma, n_steps)
    hist = []
    for it in range(iters):
        idx = rng.choice(len(S), batch, replace=False)
        Sb, Xb, Db = S[idx], X[idx], delta[idx]
        fwd = ntb_positions(net, Xb, Db)
        loss = -pnl(Sb, fwd[0], K, cost, p0)[0]
        cv, q = cvar(loss, alpha)
        hist.append(cv)
        w = -(loss >= q).astype(float) / max((loss >= q).sum(), 1)            # ∂CVaR/∂PnL (tail average)
        _, grads = ntb_grad(net, Sb, Xb, Db, K, cost, p0, w, fwd)
        net.step(grads)
    return net, hist


def train_ff(S, K, T, sigma, cost, p0, n_steps, alpha=0.95, iters=250, batch=1024, seed=1, hidden=24):
    rng = np.random.default_rng(seed)
    net = MLP([3, hidden, hidden, 1], rng)
    X, delta, _, _ = features(S, K, T, sigma, n_steps)
    hist = []
    for it in range(iters):
        idx = rng.choice(len(S), batch, replace=False)
        Sb, Xb, Db = S[idx], X[idx], delta[idx]
        d = Db + net.forward(Xb.reshape(-1, 3)).reshape(batch, n_steps)
        pl, _, _ = pnl(Sb, d, K, cost, p0)
        loss = -pl
        cv, q = cvar(loss, alpha)
        hist.append(cv)
        dL_dpnl = -(loss >= q).astype(float) / max((loss >= q).sum(), 1)
        up = _direct_grad(Sb, d, cost) * dL_dpnl[:, None]
        net.step(net.backward(up.reshape(-1, 1)))
    return net, hist


def ww_positions(delta, gamma, S, cost, gamma_ra, tau):
    """Whalley-Wilmott band hedge: move to the nearest band edge only when outside it."""
    h = (1.5 * cost * S[:, :-1] * gamma ** 2 / max(gamma_ra, 1e-12)) ** (1 / 3)
    P, N = delta.shape
    d = np.empty((P, N))
    prev = np.zeros(P)
    for t in range(N):
        prev = np.clip(prev, delta[:, t] - h[:, t], delta[:, t] + h[:, t])
        d[:, t] = prev
    return d


# ─── report ──────────────────────────────────────────────────────────────────

def _summ(pl, turnover, tc, alpha):
    loss = -pl
    cv, q = cvar(loss, alpha)
    return {"mean": float(pl.mean()), "std": float(pl.std()), "cvar": cv, "var": float(q),
            "var_99": float(np.quantile(loss, 0.99)), "turnover": float(turnover.mean()),
            "cost": float(tc.mean()), "risk_price": None}


def deep_hedge_report(S0, K, T, sigma, cost_bps, n_steps=30, alpha=0.95, jump=None, test_jump="same",
                      test_sigma=None, n_train=10000, n_test=8000, iters=250, seed=7, is_call=True):
    """Train on (sigma, jump); test out of sample on the same or a shifted regime."""
    k = K / S0
    cost = cost_bps / 1e4
    rng = np.random.default_rng(seed)
    S_tr = simulate(n_train, n_steps, T, sigma, rng, jump)
    tj = jump if test_jump == "same" else test_jump
    ts = test_sigma or sigma
    S_te = simulate(n_test, n_steps, T, ts, rng, tj)
    p0 = float(bs_call(1.0, k, T, sigma)[0])

    ntb, h_ntb = train_ntb(S_tr, k, T, sigma, cost, p0, n_steps, alpha, iters)
    ff, h_ff = train_ff(S_tr, k, T, sigma, cost, p0, n_steps, alpha, iters)

    # Tune Whalley-Wilmott risk aversion on the training paths (same objective).
    Xtr, Dtr, Gtr, tau = features(S_tr, k, T, sigma, n_steps)
    best = None
    for g in np.geomspace(0.1, 1e6, 36):
        c_ = cvar(-pnl(S_tr, ww_positions(Dtr, Gtr, S_tr, cost, g, tau), k, cost, p0)[0], alpha)[0]
        if best is None or c_ < best[0]:
            best = (c_, g)
    gamma_ra = best[1]

    X, D, G, tau = features(S_te, k, T, sigma, n_steps)
    pos = {"No hedge": np.zeros_like(D), "BS delta": D,
           "Whalley-Wilmott": ww_positions(D, G, S_te, cost, gamma_ra, tau),
           "Deep NTB": ntb_positions(ntb, X, D)[0],
           "Deep FF": D + ff.forward(X.reshape(-1, 3)).reshape(D.shape)}
    rows = {}
    pls = {}
    for name, d in pos.items():
        pl, to, tc = pnl(S_te, d, k, cost, p0)
        pls[name] = pl
        rows[name] = _summ(pl * S0, to, tc * S0, alpha)
        rows[name]["risk_price"] = float(p0 * S0 + rows[name]["cvar"])   # premium making CVaR = 0
    # Learned band vs Whalley-Wilmott on a moneyness grid at a few times to expiry.
    grid_m = np.linspace(-2.0, 2.0, 61)
    bands = []
    for frac in (1.0, 0.5, 0.15):
        tt = T * frac
        Sg = k * np.exp(grid_m * sigma * np.sqrt(T))
        _, dg, gg = bs_call(Sg, k, tt, sigma)
        Xg = np.stack([grid_m, np.full_like(grid_m, np.sqrt(frac)), np.full_like(grid_m, sigma)], axis=-1)
        z = ntb.forward(Xg)
        hw = (1.5 * cost * Sg * gg ** 2 / gamma_ra) ** (1 / 3)
        bands.append({"tau_frac": frac, "spot": (Sg * S0).tolist(), "delta": dg.tolist(),
                      "ntb_lo": (dg - softplus(z[:, 0])).tolist(), "ntb_hi": (dg + softplus(z[:, 1])).tolist(),
                      "ww_lo": (dg - hw).tolist(), "ww_hi": (dg + hw).tolist()})
    i = int(np.argsort(np.abs(S_te[:, -1] - k))[len(S_te) // 50])          # a path ending near the strike
    sample = {"t": (np.arange(n_steps) * T / n_steps * 365).tolist(), "spot": (S_te[i, :-1] * S0).tolist(),
              "positions": {n: d[i].tolist() for n, d in pos.items() if n != "No hedge"}}
    lo = min(np.quantile(p, 0.005) for p in pls.values()) * S0
    hi = max(np.quantile(p, 0.995) for p in pls.values()) * S0
    edges = np.linspace(lo, hi, 51)
    hists = {n: np.histogram(np.clip(p * S0, lo, hi), bins=edges)[0].tolist() for n, p in pls.items() if n != "No hedge"}
    return {"premium": p0 * S0, "alpha": alpha, "cost_bps": cost_bps, "n_steps": n_steps,
            "gamma_ra": gamma_ra, "strategies": rows, "bands": bands, "sample": sample,
            "pnl_hist": {"centers": (0.5 * (edges[1:] + edges[:-1])).tolist(), "counts": hists},
            "training": {"ntb": [h * S0 for h in h_ntb], "ff": [h * S0 for h in h_ff]},
            "train_regime": {"sigma": sigma, "jump": jump},
            "test_regime": {"sigma": ts, "jump": tj}}
