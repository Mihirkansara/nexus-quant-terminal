"""
tarf.py — Target Redemption Forwards (TARFs) for FX, gold and crypto, priced under three
smile models so the model risk the dealer is running is visible.

Product (per fixing i = 1..n, notional N, strike K, leverage L, target G):
  buy  (importer buys base):  gain_i = S_i − K if S_i > K else 0 ; loss_i = L·(K − S_i) if S_i < K
  sell (exporter sells base): gain_i = K − S_i if S_i < K else 0 ; loss_i = L·(S_i − K) if S_i > K
The accrued intrinsic A_i = Σ gain_j. The trade knocks out at the first fixing where
A_i ≥ G. At that fixing the client receives, by term-sheet convention,
  "full":  the whole gain_i;   "exact": only G − A_{i−1} (the target is paid exactly);
  "none":  nothing for the KO fixing.
Profit is capped by the target; losses are geared and uncapped — the asymmetry behind the
2015–16 USD/CNH TRF losses in Taiwan and the recurring mis-selling cases.

Models (all simulated on the forward, so the vanilla forward strip is matched exactly):
  BS     — flat implied vol.
  LV     — Dupire local vol from an SSVI implied-vol surface (Gatheral & Jacquier 2014),
           calibrated to ATM / 25Δ RR / 25Δ BF; local variance from Gatheral's formula in
           total variance w(k, T). SSVI with η(1+|ρ|) ≤ 2 is free of static arbitrage.
  Jumps  — Merton (1976) lognormal jumps with the diffusion vol chosen so the ATM total
           variance matches.
TARF value differs across models because the KO and the leveraged leg depend on the
distribution of the path (forward skew), not just on vanilla prices — see Clarus FT
"TARF pricing with the Dupire local volatility model" and ION's LV note.

References:
    Gatheral, J. & Jacquier, A. (2014). "Arbitrage-free SVI volatility surfaces",
        Quantitative Finance 14(1), 59–71.
    Gatheral, J. (2006). The Volatility Surface, ch. 1–2 (Dupire in total variance).
    Dupire, B. (1994). "Pricing with a smile", Risk 7(1).
    Wystup, U. (2017). FX Options and Structured Products, 2nd ed., §2.7 (TARFs).
"""

import numpy as np
from scipy.optimize import brentq, least_squares
from scipy.stats import norm


# ─── SSVI surface & Dupire local vol ─────────────────────────────────────────

def ssvi_w(k, theta, rho, eta, gamma=0.5):
    """SSVI total implied variance w(k, θ) with power-law φ(θ) = η / θ^γ."""
    phi = eta / np.power(theta, gamma)
    pk = phi * k
    return 0.5 * theta * (1 + rho * pk + np.sqrt((pk + rho) ** 2 + 1 - rho ** 2))


def _k_forward_delta(theta, rho, eta, target, call=True):
    """Log-moneyness with forward delta = target (0.25 call / 0.25 put) on the SSVI smile."""
    def f(k):
        w = ssvi_w(k, theta, rho, eta)
        d1 = (-k + 0.5 * w) / np.sqrt(w)
        return (norm.cdf(d1) - target) if call else (norm.cdf(-d1) - target)
    return brentq(f, -6 * np.sqrt(theta) - 1, 6 * np.sqrt(theta) + 1)


def fit_ssvi(atm, rr25, bf25, T):
    """(ρ, η) reproducing the 25Δ risk reversal and butterfly at tenor T (ATM vol fixed)."""
    theta = atm ** 2 * T

    def resid(p):
        rho, eta = p
        kc = _k_forward_delta(theta, rho, eta, 0.25, True)
        kp = _k_forward_delta(theta, rho, eta, 0.25, False)
        vc, vp = np.sqrt(ssvi_w(kc, theta, rho, eta) / T), np.sqrt(ssvi_w(kp, theta, rho, eta) / T)
        return [(vc - vp) - rr25, 0.5 * (vc + vp) - atm - bf25]

    best = None
    for r0 in (-0.3, 0.0, 0.3):
        for e0 in (0.3, 1.0):
            try:
                sol = least_squares(resid, [r0, e0], bounds=([-0.99, 1e-4], [0.99, 4.0]))
            except ValueError:
                continue
            if best is None or sol.cost < best.cost:
                best = sol
    rho, eta = best.x
    # Enforce the Gatheral-Jacquier no-butterfly-arbitrage condition η(1+|ρ|) ≤ 2.
    eta = min(eta, 2 / (1 + abs(rho)) - 1e-6)
    return {"rho": float(rho), "eta": float(eta), "fit_error": float(np.sqrt(2 * best.cost)),
            "arb_free": bool(eta * (1 + abs(rho)) <= 2)}


def ssvi_implied_vol(k, T, atm, rho, eta):
    return np.sqrt(ssvi_w(k, atm ** 2 * T, rho, eta) / T)


def local_vol_grid(atm, rho, eta, T_max, n_t=200, k_span=6.0):
    """
    Dupire local vol σ_loc(t, k) on a grid, with a flat ATM term structure θ_t = atm²·t:
        σ_loc² = (∂w/∂T) / (1 − (k/w)∂_k w + ¼(−¼ − 1/w + k²/w²)(∂_k w)² + ½ ∂²_k w).
    """
    ts = np.linspace(T_max / n_t, T_max, n_t)
    sd = atm * np.sqrt(T_max)
    ks = np.linspace(-k_span * sd, k_span * sd, 241)
    hk, out = ks[1] - ks[0], np.empty((n_t, len(ks)))
    for i, t in enumerate(ts):
        th = atm ** 2 * t
        dth = atm ** 2 * t * 1e-4
        w = ssvi_w(ks, th, rho, eta)
        wT = (ssvi_w(ks, th + dth, rho, eta) - ssvi_w(ks, th - dth, rho, eta)) / (2 * dth) * atm ** 2
        wk = np.gradient(w, hk)
        wkk = np.gradient(wk, hk)
        den = 1 - ks / w * wk + 0.25 * (-0.25 - 1 / w + ks ** 2 / w ** 2) * wk ** 2 + 0.5 * wkk
        lv2 = wT / np.maximum(den, 1e-6)
        out[i] = np.sqrt(np.clip(lv2, (0.05 * atm) ** 2, (8 * atm) ** 2))
    return ts, ks, out


# ─── path simulation on the forward ──────────────────────────────────────────

def simulate(S, r_d, r_f, fix_times, model, sigma, n_paths, rng, ssvi=None, jump=None, substeps=2):
    """Spot at the fixing times. The forward drift r_d − r_f is applied exactly."""
    fix_times = np.asarray(fix_times, float)
    grid = np.unique(np.concatenate([np.linspace(0, fix_times[-1], len(fix_times) * substeps + 1), fix_times]))
    dts = np.diff(grid)
    x = np.zeros(n_paths)                                 # log(S_t / F(0, t))
    out = np.empty((n_paths, len(fix_times)))
    j = 0
    if model == "lv":
        ts, ks, lv = local_vol_grid(sigma, ssvi["rho"], ssvi["eta"], fix_times[-1])
    if model == "jump":
        lam, mj, sj = jump["lambda"], jump["mean"], jump["sd"]
        comp = lam * (np.exp(mj + 0.5 * sj ** 2) - 1)
        diff_var = max(sigma ** 2 - lam * (mj ** 2 + sj ** 2), (0.2 * sigma) ** 2)
        sd_diff = np.sqrt(diff_var)
    for step, dt in enumerate(dts):
        t0 = grid[step]
        z = rng.standard_normal(n_paths)
        if model == "bs":
            x += -0.5 * sigma ** 2 * dt + sigma * np.sqrt(dt) * z
        elif model == "lv":
            it = min(np.searchsorted(ts, t0 + 0.5 * dt), len(ts) - 1)
            s_loc = np.interp(x, ks, lv[it])
            x += -0.5 * s_loc ** 2 * dt + s_loc * np.sqrt(dt) * z
        else:
            n = rng.poisson(lam * dt, n_paths)
            jmp = n * mj + np.sqrt(n) * sj * rng.standard_normal(n_paths)
            x += (-comp - 0.5 * diff_var) * dt + sd_diff * np.sqrt(dt) * z + jmp
        t1 = grid[step + 1]
        while j < len(fix_times) and np.isclose(t1, fix_times[j]):
            out[:, j] = S * np.exp((r_d - r_f) * t1 + x)
            j += 1
    if model == "lv":
        # Martingale correction: Euler on local vol leaves a small drift — re-centre each column.
        F = S * np.exp((r_d - r_f) * fix_times)
        out *= (F / out.mean(axis=0))[None, :]
    return out


# ─── TARF payoff ─────────────────────────────────────────────────────────────

def tarf_cashflows(paths, K, target, side="buy", leverage=2.0, notional=1.0, target_type="full"):
    """Per-path, per-fixing client cash flows, KO flags and KO fixing index (n = never)."""
    n_paths, n = paths.shape
    sign = 1.0 if side == "buy" else -1.0
    raw = sign * (paths - K)                               # client intrinsic per unit
    gain = np.maximum(raw, 0)
    loss = np.minimum(raw, 0) * leverage
    acc = np.cumsum(gain, axis=1)
    hit = acc >= target
    ko = np.where(hit.any(axis=1), hit.argmax(axis=1), n)
    idx = np.arange(n)[None, :]
    alive = idx < ko[:, None]
    at_ko = idx == ko[:, None]
    cf = (gain + loss) * alive
    prev_acc = np.where(ko > 0, acc[np.arange(n_paths), np.maximum(ko - 1, 0)], 0.0)
    prev_acc = np.where(ko == 0, 0.0, prev_acc)
    if target_type == "full":
        ko_pay = gain
    elif target_type == "exact":
        ko_pay = np.broadcast_to((target - prev_acc)[:, None], gain.shape)
    else:
        ko_pay = np.zeros_like(gain)
    cf = cf + ko_pay * at_ko
    return cf * notional, ko


def tarf_value(paths, fix_times, r_d, K, target, **kw):
    cf, ko = tarf_cashflows(paths, K, target, **kw)
    df = np.exp(-r_d * np.asarray(fix_times))
    pv = (cf * df[None, :]).sum(axis=1)
    return pv, cf, ko


def zero_cost_strike(paths, fix_times, r_d, target, side, **kw):
    def f(K):
        return tarf_value(paths, fix_times, r_d, K, target, side=side, **kw)[0].mean()
    F = paths.mean(axis=0)
    lo, hi = F.min() * 0.5, F.max() * 1.5
    return float(brentq(f, lo, hi, xtol=1e-10 * F.mean()))


def tarf_report(S, r_d, r_f, sigma, side="buy", n_fix=12, freq_per_year=12, K=None, target_pct=None,
                leverage=2.0, notional=1.0, target_type="full", rr25=None, bf25=None, jump=None,
                n_paths=20000, seed=17, models=("bs", "lv", "jump")):
    """Price one TARF under several models; the strike defaults to zero-cost under LV (or BS)."""
    fix = np.arange(1, n_fix + 1) / freq_per_year
    T = fix[-1]
    ssvi = None
    if rr25 is not None and bf25 is not None:
        ssvi = fit_ssvi(sigma, rr25, bf25, min(max(T / 2, 1 / 12), 1.0))
    if jump is None:
        jump = {"lambda": 3.0, "mean": -0.04 if side == "buy" else 0.04, "sd": 0.05}
    run = [m for m in models if not (m == "lv" and ssvi is None)]
    # Default target ≈ 3 one-fixing standard deviations of spot: an expected life of a few fixings.
    # (Smaller targets cap the client's gains harder and push the zero-cost strike further away.)
    target = (target_pct / 100 * S) if target_pct else 3.0 * S * sigma * np.sqrt(1 / freq_per_year)
    sims = {}
    for m in run:
        rng = np.random.default_rng(seed)
        sims[m] = simulate(S, r_d, r_f, fix, m, sigma, n_paths, rng, ssvi=ssvi, jump=jump)
    ref = "lv" if "lv" in sims else "bs"
    kw = dict(leverage=leverage, notional=notional, target_type=target_type)
    K0 = zero_cost_strike(sims[ref], fix, r_d, target, side, **kw)
    K = K if K else K0
    rows, detail = {}, None
    for m, p in sims.items():
        pv, cf, ko = tarf_value(p, fix, r_d, K, target, side=side, **kw)
        try:
            k_m = zero_cost_strike(p, fix, r_d, target, side, **kw)
        except ValueError:
            k_m = None
        dist = cf.sum(axis=1)
        rows[m] = {"pv": float(pv.mean()), "pv_se": float(pv.std() / np.sqrt(len(pv))),
                   "zero_cost_strike": k_m, "prob_ko": float((ko < n_fix).mean()),
                   "expected_fixings": float(np.minimum(ko + 1, n_fix).mean()),
                   "client_es_5": float(-np.sort(dist)[:max(1, len(dist) // 20)].mean()),
                   "prob_loss": float((dist < 0).mean())}
        if m == ref:
            hazard = np.bincount(np.minimum(ko, n_fix), minlength=n_fix + 1)[:n_fix] / len(ko)
            hist = np.histogram(dist, bins=50)
            fav = (side == "buy") * (p > K) + (side == "sell") * (p < K)
            detail = {"ko_by_fixing": hazard.tolist(), "survival": (1 - np.cumsum(hazard)).tolist(),
                      "expected_cf": (cf.mean(axis=0)).tolist(),
                      "prob_favourable": fav.mean(axis=0).tolist(),
                      "pnl_hist": {"centers": (0.5 * (hist[1][1:] + hist[1][:-1])).tolist(), "counts": hist[0].tolist()},
                      "pnl_quantiles": {q: float(np.quantile(dist, q)) for q in (0.01, 0.05, 0.5, 0.95)},
                      "sample_paths": p[:8].tolist()}
    # Greeks of the client position under the reference model (common random numbers).
    def pv_at(spot=S, vol=sigma):
        rng = np.random.default_rng(seed)
        pp = simulate(spot, r_d, r_f, fix, ref, vol, n_paths, rng, ssvi=ssvi, jump=jump)
        return tarf_value(pp, fix, r_d, K, target, side=side, **kw)[0].mean()
    h = 0.005 * S
    base = rows[ref]["pv"]
    delta = (pv_at(spot=S + h) - pv_at(spot=S - h)) / (2 * h)
    vega = (pv_at(vol=sigma + 0.01) - pv_at(vol=sigma - 0.01)) / 2
    fwd = S * np.exp((r_d - r_f) * fix)
    strip = float((np.exp(-r_d * fix) * (1 if side == "buy" else -1) * (fwd - K)).sum() * notional)
    return {"fixing_times": fix.tolist(), "forwards": fwd.tolist(), "strike": float(K),
            "zero_cost_strike": K0, "target": float(target), "target_pct": float(target / S * 100),
            "reference_model": ref, "models": rows, "ssvi": ssvi, "jump": jump,
            "greeks": {"delta": float(delta), "vega_1pt": float(vega), "value": base},
            "forward_strip_pv": strip, "detail": detail,
            "max_gain": float(target * notional), "n_fix": n_fix}
