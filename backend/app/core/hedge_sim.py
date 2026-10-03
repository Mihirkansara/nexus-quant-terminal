"""
hedge_sim.py — Monte Carlo delta-hedging / gamma-scalping P&L lab.

Simulates holding an option portfolio (any mix of calls/puts, each leg settling at
its own expiry) bought or sold at an implied vol σ_i and delta-hedged in the
underlying, and returns the P&L distribution with an attribution and analytic
benchmarks. Pricing and deltas use Garman-Kohlhagen (r_d domestic, r_f foreign /
lease rate / ≈0 for crypto).

Why a desk uses this: the delta-hedged P&L of a vanilla is, to first order,
    dP&L ≈ ½ Γ S² (σ_realised² − σ_implied²) dt
so a long option is long realised and short implied variance. What actually lands
on the P&L also depends on discrete hedging, jumps and weekend gaps (which no hedge
can follow), and transaction costs — all simulated here.

Market scenarios
  • "gbm":       lognormal, constant realised vol σ_r.
  • "jump":      Merton (1976) jump-diffusion: compound-Poisson log-normal jumps
                 (intensity λ/yr, mean μ_J, sd σ_J), diffusion vol chosen so total
                 variance per year equals σ_r²; drift-compensated.
  • "bootstrap": stationary block bootstrap (Politis & Romano 1994) of the asset's
                 own daily log returns — real fat tails, gaps and vol clustering —
                 optionally rescaled to σ_r. Intraday steps are a Brownian bridge
                 that sums exactly to each resampled day.
  For 24/5 assets (FX, metals) every Monday's first step adds a weekend-gap shock
  (sd = weekend_gap, fraction of spot) that occurs while the hedge cannot trade.

Hedging rules
  • "time": rebalance to the target delta every step (steps_per_day per trading day).
  • "band": rebalance only when the hedge is off target by more than band delta per
            unit of option notional (band × Σ|qty|); a simple no-trade region in the
            spirit of Whalley & Wilmott (1997).

Benchmarks
  • Theoretical edge (hedging at realised vol, continuous): qty·(V(σ_r) − V(σ_i))·e^{r_d T}.
  • Derman & Kamal (1999) discrete-hedging error: sd ≈ sqrt(π / 4N) · |vega| · σ.
  • Leland (1985) cost: hedge-cost ≈ V(σ_L) − V(σ_r) with
        σ_L² = σ_r² · (1 + √(2/π) · k / (σ_r √δt)),  k = round-trip proportional cost.

References:
    Derman, E. & Kamal, M. (1999). "When you cannot hedge continuously." Risk.
    Leland, H. (1985). J. Finance, 40(5), 1283–1301.
    Merton, R. (1976). J. Financial Economics, 3, 125–144.
    Politis, D. & Romano, J. (1994). JASA, 89(428), 1303–1313.
    Ahmad, R. & Wilmott, P. (2005). "Which free lunch would you like today, Sir?"
        Wilmott Magazine.
    Whalley, A. & Wilmott, P. (1997). Mathematical Finance, 7(3), 307–324.
"""

import numpy as np
from scipy.stats import norm

_EPS_T = 1e-10


# ─── vectorised Garman-Kohlhagen ──────────────────────────────────────────────

def gk_price_delta(S, K, tau, r_d, r_f, sigma, is_call):
    """Price and spot delta per unit for arrays of spots at time-to-expiry tau (≥0)."""
    S = np.asarray(S, dtype=float)
    if tau <= _EPS_T:
        payoff = np.maximum(S - K, 0.0) if is_call else np.maximum(K - S, 0.0)
        delta = (S > K).astype(float) if is_call else -(S < K).astype(float)
        return payoff, delta
    sq = sigma * np.sqrt(tau)
    d1 = (np.log(S / K) + (r_d - r_f + 0.5 * sigma ** 2) * tau) / sq
    d2 = d1 - sq
    df_d, df_f = np.exp(-r_d * tau), np.exp(-r_f * tau)
    if is_call:
        return S * df_f * norm.cdf(d1) - K * df_d * norm.cdf(d2), df_f * norm.cdf(d1)
    return K * df_d * norm.cdf(-d2) - S * df_f * norm.cdf(-d1), -df_f * norm.cdf(-d1)


def gk_gamma_vega(S, K, tau, r_d, r_f, sigma):
    sq = sigma * np.sqrt(tau)
    d1 = (np.log(S / K) + (r_d - r_f + 0.5 * sigma ** 2) * tau) / sq
    df_f = np.exp(-r_f * tau)
    return df_f * norm.pdf(d1) / (S * sq), S * df_f * norm.pdf(d1) * np.sqrt(tau)


def portfolio_value_delta(S, legs, t, r_d, r_f, sigma):
    """Value and delta of the still-live legs at time t (expired legs contribute 0)."""
    S = np.asarray(S, dtype=float)
    v, d = np.zeros_like(S), np.zeros_like(S)
    for leg in legs:
        tau = leg["T"] - t
        if tau > _EPS_T:
            p, dl = gk_price_delta(S, leg["K"], tau, r_d, r_f, sigma, leg["type"] == "call")
            v += leg["qty"] * p
            d += leg["qty"] * dl
    return v, d


# ─── scenario generation ──────────────────────────────────────────────────────

def _time_grid(T, ppy, steps_per_day, start_weekday):
    """Step lengths in years and the indices of steps that open after a weekend."""
    n_days = max(1, int(round(T * ppy)))
    n = n_days * steps_per_day
    dt = np.full(n, T / n)
    monday_steps = []
    if ppy != 365:                                   # 24/5 market: weekend gaps
        wd = start_weekday
        for day in range(n_days):
            if day > 0 and wd == 0:
                monday_steps.append(day * steps_per_day)
            wd = (wd + 1) % 5                        # trading-day clock: Mon..Fri
    return dt, np.array(monday_steps, dtype=int), n_days


def simulate_log_increments(model, n_paths, dt, sigma_r, rng, mu=0.0, jump=None,
                            hist_returns=None, steps_per_day=1, rescale=True,
                            block=5):
    """Log-price increments, shape (n_paths, n_steps), with drift mu (risk-neutral by default)."""
    n = len(dt)
    if model == "bootstrap":
        r = np.asarray(hist_returns, dtype=float)
        r = r[np.isfinite(r)]
        if len(r) < 60:
            raise ValueError("not enough history to bootstrap")
        r = r - r.mean()
        day_len = dt[0] * steps_per_day
        if rescale:
            r = r * (sigma_r * np.sqrt(day_len)) / r.std()
        # Risk-neutral drift with the bootstrap's own convexity term.
        r = r + (mu - 0.5 * r.var() / day_len) * day_len
        n_days = n // steps_per_day
        # Stationary bootstrap: blocks with geometric lengths (mean `block`).
        idx = np.empty((n_paths, n_days), dtype=int)
        cur = rng.integers(0, len(r), n_paths)
        for d in range(n_days):
            restart = rng.random(n_paths) < 1.0 / block
            cur = np.where(restart, rng.integers(0, len(r), n_paths), (cur + 1) % len(r))
            idx[:, d] = cur
        daily = r[idx]
        if steps_per_day == 1:
            x = daily
        else:
            # Brownian bridge inside each day: increments sum exactly to the daily return.
            z = rng.standard_normal((n_paths, n_days, steps_per_day))
            z -= z.mean(axis=2, keepdims=True)
            scale = np.abs(daily)[..., None] / np.sqrt(steps_per_day)
            x = (daily[..., None] / steps_per_day + scale * z).reshape(n_paths, n)
        return x
    sig_diff = sigma_r
    jumps = 0.0
    comp = 0.0
    if model == "jump" and jump:
        lam, mj, sj = jump["lambda"], jump["mean"], jump["sd"]
        jump_var = lam * (mj ** 2 + sj ** 2)
        sig_diff = np.sqrt(max(sigma_r ** 2 - jump_var, 0.05 * sigma_r ** 2))
        k = np.exp(mj + 0.5 * sj ** 2) - 1
        comp = lam * k                              # drift compensator
        counts = rng.poisson(lam * dt, size=(n_paths, n))
        jumps = counts * mj + np.sqrt(counts) * sj * rng.standard_normal((n_paths, n))
    z = rng.standard_normal((n_paths, n))
    return (mu - comp - 0.5 * sig_diff ** 2) * dt + sig_diff * np.sqrt(dt) * z + jumps


# ─── hedging engine ───────────────────────────────────────────────────────────

def run_hedge(legs, S0, sigma_i, r_d, r_f, log_inc, dt, *, hedge_sigma=None, rule="time",
              band=0.1, cost_bps=0.0, keep_paths=8):
    """
    Self-financing delta hedge of `legs` (bought/sold at sigma_i at t=0).
    Returns per-path P&L (domestic currency at T) and its attribution.
    """
    hs = sigma_i if hedge_sigma is None else hedge_sigma
    n_paths, n = log_inc.shape
    T = float(np.sum(dt))
    t_grid = np.concatenate([[0.0], np.cumsum(dt)])
    cost = cost_bps / 1e4

    S = np.full(n_paths, float(S0))
    V0 = float(portfolio_value_delta(np.array([S0]), legs, 0.0, r_d, r_f, sigma_i)[0][0])
    _, d0 = portfolio_value_delta(S, legs, 0.0, r_d, r_f, hs)
    h = -d0                                        # units of underlying held
    tc = cost * np.abs(h) * S
    cash = -V0 - h * S - tc
    total_cost = tc.copy()
    carry = np.zeros(n_paths)
    settled = np.zeros(n_paths)
    done = [False] * len(legs)
    band_units = band * sum(abs(l["qty"]) for l in legs)
    n_trades = np.zeros(n_paths)
    keep = min(keep_paths, n_paths)
    path_S = [S[:keep].copy()]

    for k in range(n):
        g = dt[k]
        cash *= np.exp(r_d * g)
        carry_k = h * S * (np.exp(r_f * g) - 1.0)      # foreign interest / lease on hedge
        cash += carry_k
        carry += carry_k
        S = S * np.exp(log_inc[:, k])
        t = t_grid[k + 1]
        # Settle each leg once, at the first grid time on or after its expiry.
        for j, leg in enumerate(legs):
            if not done[j] and (leg["T"] <= t + 1e-12 or k == n - 1):
                pay = np.maximum(S - leg["K"], 0) if leg["type"] == "call" else np.maximum(leg["K"] - S, 0)
                settled += leg["qty"] * pay
                cash += leg["qty"] * pay
                done[j] = True
        if k == n - 1:
            break
        live = [l for j, l in enumerate(legs) if not done[j]]
        if not live:
            target = np.zeros(n_paths)
        else:
            target = -portfolio_value_delta(S, live, t, r_d, r_f, hs)[1]
        if rule == "band":
            trade = np.where(np.abs(h - target) > band_units, target - h, 0.0)
        else:
            trade = target - h
        tc = cost * np.abs(trade) * S
        cash -= trade * S + tc
        total_cost += tc
        n_trades += trade != 0
        h = h + trade
        if len(path_S) < 400 or k % max(1, n // 400) == 0:
            path_S.append(S[:keep].copy())

    # Close the hedge at T.
    tc = cost * np.abs(h) * S
    cash += h * S - tc
    total_cost += tc
    pnl = cash
    option_pnl = settled - V0 * np.exp(r_d * T)
    hedge_pnl = pnl - option_pnl + total_cost
    return {
        "pnl": pnl, "option_pnl": option_pnl, "hedge_pnl": hedge_pnl, "costs": total_cost,
        "carry": carry, "n_trades": n_trades, "premium": V0, "T": T,
        "sample_spots": np.array(path_S).T if keep else None,
    }


# ─── analytics ────────────────────────────────────────────────────────────────

def _stats(x):
    x = np.asarray(x, dtype=float)
    q05 = np.quantile(x, 0.05)
    tail = x[x <= q05]
    return {"mean": float(x.mean()), "std": float(x.std()), "p05": float(q05),
            "p50": float(np.median(x)), "p95": float(np.quantile(x, 0.95)),
            "es05": float(tail.mean()) if len(tail) else float(q05),
            "prob_profit": float((x > 0).mean()), "min": float(x.min()), "max": float(x.max())}


def benchmarks(legs, S0, sigma_i, sigma_r, r_d, r_f, n_rebalances, cost_bps):
    T = max(l["T"] for l in legs)
    vi = portfolio_value_delta(np.array([S0]), legs, 0.0, r_d, r_f, sigma_i)[0][0]
    vr = portfolio_value_delta(np.array([S0]), legs, 0.0, r_d, r_f, sigma_r)[0][0]
    vega = sum(l["qty"] * gk_gamma_vega(S0, l["K"], l["T"], r_d, r_f, sigma_r)[1] for l in legs)
    gamma = sum(l["qty"] * gk_gamma_vega(S0, l["K"], l["T"], r_d, r_f, sigma_r)[0] for l in legs)
    dk = float(np.sqrt(np.pi / (4 * max(n_rebalances, 1))) * abs(vega) * sigma_r)
    k = 2 * cost_bps / 1e4                          # round-trip proportional cost
    dt_h = T / max(n_rebalances, 1)
    leland_num = np.sqrt(2 / np.pi) * k / (sigma_r * np.sqrt(dt_h)) if k > 0 else 0.0
    sig_l = sigma_r * np.sqrt(1 + leland_num)
    vl = portfolio_value_delta(np.array([S0]), legs, 0.0, r_d, r_f, sig_l)[0][0]
    return {
        "premium_at_implied": float(vi),
        "value_at_realised": float(vr),
        "theoretical_edge": float((vr - vi) * np.exp(r_d * T)),
        "derman_kamal_sd": dk,
        "leland_number": float(leland_num),
        "leland_vol": float(sig_l),
        "leland_cost": float(abs(vl - vr) * np.exp(r_d * T)),
        "vega_1vol": float(vega / 100),
        "dollar_gamma_1pct": float(0.5 * gamma * (0.01 * S0) ** 2),
    }


def hedge_report(legs, S0, sigma_i, sigma_r, r_d, r_f, ppy, *, model="gbm", steps_per_day=1,
                 rule="time", band=0.1, cost_bps=0.0, n_paths=2000, jump=None,
                 weekend_gap=0.0, hist_returns=None, rescale=True, seed=7, start_weekday=0,
                 sweep=True):
    """Full P&L lab report."""
    legs = [dict(l, T=float(l["T"]), K=float(l["K"]), qty=float(l["qty"])) for l in legs]
    T = max(l["T"] for l in legs)
    rng = np.random.default_rng(seed)
    mu = r_d - r_f                                  # risk-neutral drift (P&L vs implied)

    def simulate(spd, paths, rng_):
        dt, mondays, _ = _time_grid(T, ppy, spd, start_weekday)
        inc = simulate_log_increments(model, paths, dt, sigma_r, rng_, mu=mu, jump=jump,
                                      hist_returns=hist_returns, steps_per_day=spd,
                                      rescale=rescale)
        if weekend_gap > 0 and len(mondays):
            inc[:, mondays] += weekend_gap * rng_.standard_normal((paths, len(mondays))) \
                - 0.5 * weekend_gap ** 2
        return inc, dt, mondays

    inc, dt, mondays = simulate(steps_per_day, n_paths, rng)
    res = run_hedge(legs, S0, sigma_i, r_d, r_f, inc, dt, rule=rule, band=band,
                    cost_bps=cost_bps)
    n_reb = len(dt)
    report = {
        "inputs": {"model": model, "steps_per_day": steps_per_day, "rule": rule, "band": band,
                   "cost_bps": cost_bps, "n_paths": n_paths, "T": T, "n_steps": int(n_reb),
                   "periods_per_year": ppy, "weekend_gaps": int(len(mondays)),
                   "sigma_implied": sigma_i, "sigma_realised": sigma_r},
        "pnl": _stats(res["pnl"]),
        "attribution": {
            "option": float(res["option_pnl"].mean()),
            "hedge": float(res["hedge_pnl"].mean()),
            "costs": float(-res["costs"].mean()),
            "carry": float(res["carry"].mean()),
        },
        "trades_per_path": float(res["n_trades"].mean()),
        "premium": res["premium"],
        "benchmarks": benchmarks(legs, S0, sigma_i, sigma_r, r_d, r_f, n_reb, cost_bps),
        "histogram": _histogram(res["pnl"]),
        "sample_paths": res["sample_spots"][:, :: max(1, res["sample_spots"].shape[1] // 200)].tolist()
        if res["sample_spots"] is not None else [],
    }
    if sweep:
        rows = []
        for spd in (1, 2, 4, 8, 24):
            sub = np.random.default_rng(seed + spd)
            i2, d2, m2 = simulate(spd, min(n_paths, 1000), sub)
            r2 = run_hedge(legs, S0, sigma_i, r_d, r_f, i2, d2, rule="time",
                           cost_bps=cost_bps, keep_paths=0)
            st = _stats(r2["pnl"])
            rows.append({"steps_per_day": spd, "mean": st["mean"], "std": st["std"],
                         "es05": st["es05"], "cost": float(r2["costs"].mean()),
                         "derman_kamal_sd": benchmarks(legs, S0, sigma_i, sigma_r, r_d, r_f,
                                                       len(d2), cost_bps)["derman_kamal_sd"]})
        report["frequency_sweep"] = rows
    return _clean(report)


def _histogram(x, bins=40):
    lo, hi = np.quantile(x, [0.005, 0.995])
    if hi <= lo:
        hi = lo + 1e-9
    counts, edges = np.histogram(np.clip(x, lo, hi), bins=bins, range=(lo, hi))
    return {"centers": (0.5 * (edges[1:] + edges[:-1])).tolist(), "counts": counts.tolist()}


def _clean(obj):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 8) if np.isfinite(x) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    return obj
