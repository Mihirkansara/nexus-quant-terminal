"""
variance.py — Variance swaps, the implied distribution and the variance risk premium.

Variance-swap fair strike (model-free replication, Demeterfi, Derman, Kamal & Zou 1999)
    K_var = (2/T) ∫ Q(K)/K² dK          (forward measure, undiscounted OTM prices Q, put below F)
  Discrete, on the listed strikes, exactly as the Cboe VIX / Deribit DVOL methodology:
    σ² = (2/T) Σ ΔK_i/K_i² · Q(K_i) − (1/T)(F/K₀ − 1)²
  K₀ = first listed strike at or below F; Q(K₀) = mean of call and put; ΔK_i = half the distance
  between the neighbouring strikes (one-sided at the ends); strikes beyond two consecutive
  zero bids are dropped. 30-day constant maturity by the Cboe linear interpolation in T·σ².
  The gap between the continuous (smoothed smile over wide strikes) and discrete (listed)
  strikes is the truncation / discretisation error of the index.

Volatility-swap fair strike (convexity)
  With realised variance V lognormal and vol-of-vol ν (instantaneous vol driftless lognormal,
  so Var ln V ≈ 4ν²T/3 after time-averaging), E[√V] = √E[V]·exp(−Var ln V / 8)
    K_vol ≈ √K_var · exp(−ν²T/6)
  in the spirit of Brockhaus & Long (2000); an approximation that understates the adjustment
  when jumps dominate (Broadie & Jain 2008).

Implied moments of the log return (Bakshi, Kapadia & Madan 2003), forward measure:
    V = ∫_{K>F} 2(1 − ln(K/F))/K² C dK + ∫_{K<F} 2(1 + ln(F/K))/K² P dK
    W = ∫_{K>F} (6 ln(K/F) − 3 ln²(K/F))/K² C dK − ∫_{K<F} (6 ln(F/K) + 3 ln²(F/K))/K² P dK
    X = ∫_{K>F} (12 ln²(K/F) − 4 ln³(K/F))/K² C dK + ∫_{K<F} (12 ln²(F/K) + 4 ln³(F/K))/K² P dK
    μ = E[ln S_T/F] = −(T/2)·K_var exactly (log contract) — BKM's series −V/2 − W/6 − X/24 biases kurtosis;  skew = (W − 3μV + 2μ³)/(V − μ²)^{3/2};
    kurt = (X − 4μW + 6μ²V − 3μ⁴)/(V − μ²)²
  Black-Scholes gives skew 0 and kurtosis 3 (log return normal).

Risk-neutral density (Breeden & Litzenberger 1978): f(K) = ∂²C/∂K² on undiscounted calls.
  Prices come from a smooth, arbitrage-checked smile (raw SVI, Gatheral 2004), so the density
  is not the noise of differencing raw quotes. P(S_T > K) = −∂C/∂K. One-touch odds use the
  driftless reflection approximation P(touch) ≈ 2·P(S_T beyond K), capped at 1.

Variance risk premium: implied 30-day variance (vol index²) at t against the variance realised
  over the following 30 days (zero-mean squared returns, as a variance swap settles); the
  short-variance P&L in vol points is (K_var − RV²)/(2√K_var) per unit vega notional.
"""

import numpy as np
from scipy.stats import norm

from .vol_analytics import svi_total_variance


def black76(F, K, T, sigma, call=True):
    """Undiscounted Black-76 price (forward measure)."""
    K = np.asarray(K, float)
    sigma = np.asarray(sigma, float)
    sq = sigma * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * sq * sq) / sq
    d2 = d1 - sq
    if call:
        return F * norm.cdf(d1) - K * norm.cdf(d2)
    return K * norm.cdf(-d2) - F * norm.cdf(-d1)


# ─── variance swaps ───────────────────────────────────────────────────────────

def cboe_variance(strikes, calls, puts, F, T, call_bids=None, put_bids=None):
    """Cboe VIX-style discrete variance on listed strikes (undiscounted USD prices).

    Returns {variance, vol, k0, n_strikes, k_min, k_max} or None if too few strikes survive.
    """
    K = np.asarray(strikes, float)
    order = np.argsort(K)
    K = K[order]
    C = np.asarray(calls, float)[order]
    P = np.asarray(puts, float)[order]
    cb = None if call_bids is None else np.asarray(call_bids, float)[order]
    pb = None if put_bids is None else np.asarray(put_bids, float)[order]
    below = np.where(K <= F)[0]
    if not len(below) or below[-1] + 1 >= len(K):
        return None
    i0 = below[-1]
    keep = {i0: 0.5 * (C[i0] + P[i0])}

    def walk(idx, prices, bids):
        zeros = 0
        for i in idx:
            bid = None if bids is None else bids[i]
            if bid is not None and not (bid > 0):
                zeros += 1
                if zeros >= 2:
                    break
                continue
            zeros = 0
            if np.isfinite(prices[i]) and prices[i] > 0:
                keep[i] = prices[i]
    walk(range(i0 - 1, -1, -1), P, pb)
    walk(range(i0 + 1, len(K)), C, cb)
    idx = sorted(keep)
    if len(idx) < 5:
        return None
    Ks = K[idx]
    Q = np.array([keep[i] for i in idx])
    dK = np.empty_like(Ks)
    dK[1:-1] = (Ks[2:] - Ks[:-2]) / 2
    dK[0] = Ks[1] - Ks[0]
    dK[-1] = Ks[-1] - Ks[-2]
    var = 2 / T * np.sum(dK / Ks ** 2 * Q) - (F / K[i0] - 1) ** 2 / T
    return {"variance": float(var), "vol": float(np.sqrt(max(var, 0))), "k0": float(K[i0]),
            "n_strikes": len(idx), "k_min": float(Ks[0]), "k_max": float(Ks[-1])}


def constant_maturity(T1, v1, T2, v2, target=30 / 365):
    """Cboe interpolation of variance in T·σ² to a constant maturity (years in, variance out)."""
    if T2 == T1:
        return v1
    w1 = (T2 - target) / (T2 - T1)
    return (T1 * v1 * w1 + T2 * v2 * (1 - w1)) / target


def vol_swap_strike(k_var, T, volvol):
    """√K_var · exp(−ν²T/6): lognormal realised variance with time-averaged vol-of-vol ν."""
    if k_var is None or k_var <= 0:
        return None
    return float(np.sqrt(k_var) * np.exp(-(volvol or 0.0) ** 2 * T / 6))


def forward_vols(rows):
    """Forward vol between consecutive expiries from total variance; None flags calendar arbitrage."""
    out = []
    for a, b in zip(rows, rows[1:]):
        dv = b["T"] * b["k_var"] - a["T"] * a["k_var"]
        out.append({"from_days": a["days"], "to_days": b["days"],
                    "fwd_vol": float(np.sqrt(dv / (b["T"] - a["T"]))) if dv > 0 else None,
                    "calendar_arbitrage": bool(dv <= 0)})
    return out


# ─── implied distribution ─────────────────────────────────────────────────────

def strike_grid(F, T, atm, n=1201, width=7.0):
    """Log-uniform strike grid spanning ±width ATM standard deviations (at least ±25%), F on the grid."""
    half = max(width * atm * np.sqrt(T), 0.25)
    up = half * 0.9 + 0.1
    n_dn = int(n * half / (half + up))
    x = np.concatenate([np.linspace(-half, 0, n_dn), np.linspace(0, up, n - n_dn + 1)[1:]])
    return F * np.exp(x)


def chain_from_vol(vol_fn, F, T, K):
    """Undiscounted call and put prices on K from a smile σ(K)."""
    v = np.clip(vol_fn(K), 1e-3, 5.0)
    return black76(F, K, T, v, True), black76(F, K, T, v, False), v


def continuous_variance(K, C, P, F, T):
    """K_var = (2/T) ∫ OTM/K² dK by the trapezoid rule on a fine grid."""
    Q = np.where(K < F, P, C)
    return float(2 / T * np.trapezoid(Q / K ** 2, K))


def bkm_moments(K, C, P, F, T):
    """Risk-neutral variance (annualised), skewness and kurtosis of ln(S_T/F)."""
    up, dn = K >= F, K <= F                                           # F sits on the grid (strike_grid)
    x_up, x_dn = np.log(K[up] / F), np.log(F / K[dn])
    Cu, Pd, Ku, Kd = C[up], P[dn], K[up], K[dn]
    V = np.trapezoid(2 * (1 - x_up) / Ku ** 2 * Cu, Ku) + np.trapezoid(2 * (1 + x_dn) / Kd ** 2 * Pd, Kd)
    W = (np.trapezoid((6 * x_up - 3 * x_up ** 2) / Ku ** 2 * Cu, Ku)
         - np.trapezoid((6 * x_dn + 3 * x_dn ** 2) / Kd ** 2 * Pd, Kd))
    X = (np.trapezoid((12 * x_up ** 2 - 4 * x_up ** 3) / Ku ** 2 * Cu, Ku)
         + np.trapezoid((12 * x_dn ** 2 + 4 * x_dn ** 3) / Kd ** 2 * Pd, Kd))
    Q = np.where(K < F, P, C)
    mu = -np.trapezoid(Q / K ** 2, K)                                # E[ln S_T/F], log-contract replication
    var = V - mu ** 2
    if var <= 0:
        return {"variance": None, "vol": None, "skew": None, "kurtosis": None, "mean_log": float(mu)}
    return {"variance": float(var / T), "vol": float(np.sqrt(var / T)),
            "skew": float((W - 3 * mu * V + 2 * mu ** 3) / var ** 1.5),
            "kurtosis": float((X - 4 * mu * W + 6 * mu ** 2 * V - 3 * mu ** 4) / var ** 2),
            "mean_log": float(mu)}


def density(K, C):
    """Breeden-Litzenberger density and CDF from undiscounted calls on a (non-uniform) grid."""
    dC = np.gradient(C, K)
    f = np.clip(np.gradient(dC, K), 0, None)
    cdf = np.clip(1 + dC, 0, 1)
    mass = float(np.trapezoid(f, K))
    return f, cdf, mass


def probability_ladder(K, cdf, F, moves=(-0.3, -0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2, 0.3), physical=None):
    """P(S_T below / above F·(1+m)) and reflection one-touch odds; optional physical probabilities."""
    rows = []
    for m in moves:
        lvl = F * (1 + m)
        p_below = float(np.interp(lvl, K, cdf))
        terminal = p_below if m < 0 else 1 - p_below
        row = {"move": m, "level": lvl, "p_below": p_below, "p_above": 1 - p_below,
               "p_terminal_beyond": terminal, "p_touch": min(1.0, 2 * terminal)}
        if physical is not None and len(physical):
            r = np.log(1 + m)
            row["p_physical_beyond"] = float(np.mean(physical <= r) if m < 0 else np.mean(physical >= r))
        rows.append(row)
    return rows


def quantiles(K, cdf, F, qs=(0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99)):
    c = np.maximum.accumulate(cdf)
    out = {}
    for q in qs:
        lvl = float(np.interp(q, c + np.arange(len(c)) * 1e-12, K))
        out[f"{q:g}"] = {"level": lvl, "move": lvl / F - 1}
    return out


def physical_returns(closes, horizon):
    """Overlapping demeaned log returns over `horizon` observations (drift removed to compare shape)."""
    c = np.asarray(closes, float)
    c = c[np.isfinite(c) & (c > 0)]
    if horizon < 1 or len(c) < horizon + 60:
        return np.array([])
    r = np.log(c[horizon:] / c[:-horizon])
    return r - r.mean()


def expiry_report(vol_fn, F, T, atm, volvol=None, listed=None, physical=None, n_density=160):
    """Everything the desk shows for one expiry, from a smooth smile σ(K) (+ optional listed chain)."""
    K = strike_grid(F, T, atm)
    C, P, _ = chain_from_vol(vol_fn, F, T, K)
    k_var = continuous_variance(K, C, P, F, T)
    mom = bkm_moments(K, C, P, F, T)
    f, cdf, mass = density(K, C)
    straddle = float(2 * black76(F, F, T, float(np.clip(vol_fn(np.array([F]))[0], 1e-3, 5)), True))
    disc = None
    if listed:
        disc = cboe_variance(listed["strikes"], listed["calls"], listed["puts"], F, T,
                             listed.get("call_bids"), listed.get("put_bids"))
    lo, hi = np.searchsorted(cdf, 0.0005), np.searchsorted(cdf, 0.9995)
    sl = slice(max(lo - 2, 0), min(hi + 3, len(K)))
    sub = np.linspace(sl.start, sl.stop - 1, n_density).astype(int)
    lognormal = norm.pdf(np.log(K[sub] / F), -0.5 * atm ** 2 * T, atm * np.sqrt(T)) / K[sub]
    phys = None
    if physical is not None and len(physical) > 50:
        from scipy.stats import gaussian_kde
        x = np.log(K[sub] / F)
        phys = (gaussian_kde(physical)(x) / K[sub]).tolist()
    return {
        "T": T, "days": T * 365, "forward": F, "atm_iv": atm,
        "k_var": k_var, "var_vol": float(np.sqrt(max(k_var, 0))),
        "vol_swap": vol_swap_strike(k_var, T, volvol),
        "listed": disc, "truncation_gap": (disc["vol"] - np.sqrt(k_var)) if disc else None,
        "moments": mom, "density_mass": mass,
        "expected_move": straddle, "expected_move_pct": straddle / F,
        "quantiles": quantiles(K, cdf, F),
        "ladder": probability_ladder(K, cdf, F, physical=physical),
        "density": {"strikes": K[sub].tolist(), "rnd": f[sub].tolist(), "lognormal": lognormal.tolist(),
                    "physical": phys},
    }


def svi_vol_fn(params, F, T):
    """Vectorised σ(K) from raw-SVI total variance."""
    return lambda K: np.sqrt(np.maximum(svi_total_variance(np.log(np.asarray(K, float) / F), *params), 1e-10) / T)


# ─── variance risk premium ────────────────────────────────────────────────────

def vrp_history(index_dates, index_levels, price_dates, closes, horizon, ppy, keep=730):
    """Implied 30d vol (index, %) at t vs zero-mean realised vol over the next `horizon` returns."""
    px = {str(d): float(c) for d, c in zip(price_dates, closes) if c and c > 0}
    pd_sorted = sorted(px)
    pos = {d: i for i, d in enumerate(pd_sorted)}
    lr = np.diff(np.log([px[d] for d in pd_sorted]))
    rows = []
    for d, lvl in zip(index_dates, index_levels):
        d = str(d)
        if d not in pos or not lvl or lvl <= 0:
            continue
        i = pos[d]
        iv = lvl / 100
        if i + horizon <= len(lr):
            rv = float(np.sqrt(np.mean(lr[i:i + horizon] ** 2) * ppy))
            rows.append({"date": d, "implied": iv, "realised_fwd": rv, "vrp": iv - rv,
                         "short_var_pnl": (iv ** 2 - rv ** 2) / (2 * iv)})
        else:
            rows.append({"date": d, "implied": iv, "realised_fwd": None, "vrp": None, "short_var_pnl": None})
    rows = rows[-keep:]
    done = [r for r in rows if r["vrp"] is not None]
    # Vol-of-vol over the swap horizon: the index mean-reverts, so annualising daily changes overstates it.
    lv = np.log([lvl for lvl in index_levels if lvl and lvl > 0])
    volvol = float(np.std(lv[horizon:] - lv[:-horizon], ddof=1) * np.sqrt(ppy / horizon)) if len(lv) > 3 * horizon else None
    trailing = float(np.sqrt(np.mean(lr[-horizon:] ** 2) * ppy)) if len(lr) >= horizon else None
    pnl = np.array([r["short_var_pnl"] for r in done]) if done else np.array([])
    return {
        "series": rows, "n": len(done),
        "hit_rate": float(np.mean([r["vrp"] > 0 for r in done])) if done else None,
        "mean_vrp": float(np.mean([r["vrp"] for r in done])) if done else None,
        "mean_short_var_pnl": float(pnl.mean()) if len(pnl) else None,
        "worst_short_var_pnl": float(pnl.min()) if len(pnl) else None,
        "pnl_5pct": float(np.percentile(pnl, 5)) if len(pnl) else None,
        "volvol": volvol, "current_implied": rows[-1]["implied"] if rows else None,
        "trailing_realised": trailing,
    }
