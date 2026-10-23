"""
smile_dynamics.py — SABR smiles and smile-consistent hedge ratios.

When spot moves, how does the smile move? The answer sets the hedge ratio of every option:
  sticky strike  — σ(K) fixed:                Δ = Δ_BS(σ(K))
  sticky delta   — σ fixed in moneyness K/F:   Δ = Δ_BS − vega · σ'(K) · K/F
  SABR           — α fixed, F moves:          Δ = Δ_BS + vega · ∂σ/∂F
  Bartlett       — α co-moves with F (ρ):     Δ = Δ_BS + vega · (∂σ/∂F + ∂σ/∂α · ρν/F^β)
Bartlett's delta (Bartlett 2006, Wilmott) uses the correlated part of the vol move and is the
variance-optimal hedge in SABR (Keller-Ressel 2022, arXiv:2207.13573); it is also nearly
independent of β (Hagan & Lesniewski 2017).

Each rule implies a different "backbone" — how ATM vol moves per 1 % spot move — which is
compared with the empirical spot-vol beta from the implied-vol index (Deribit DVOL, Cboe GVZ /
VXSLV): d ln IV = a + b · d ln S. A negative b with a put skew is the equity-like regime BTC
moved into in 2025–26; a positive b is the 2023–24 "spot-up, vol-up" regime.

SABR implied vol (Hagan, Kumar, Lesniewski & Woodward 2002) with the Obłój (2008) leading term:
    σ(K) = ν ln(F/K) / x(z) · [1 + ((1−β)² α² / (24 (FK)^{1−β}) + ρβνα / (4 (FK)^{(1−β)/2})
                                    + (2 − 3ρ²) ν² / 24) T]
    z = ν (F^{1−β} − K^{1−β}) / (α (1−β))   (β<1),   z = ν ln(F/K) / α   (β=1)
    x(z) = ln[(√(1 − 2ρz + z²) + z − ρ) / (1 − ρ)]
"""

import numpy as np
from scipy.optimize import least_squares
from scipy.stats import norm


def sabr_vol(K, F, T, alpha, beta, rho, nu):
    K = np.asarray(K, float)
    lfk = np.log(F / K)
    if abs(1 - beta) < 1e-12:
        z = nu * lfk / alpha
    else:
        z = nu * (F ** (1 - beta) - K ** (1 - beta)) / (alpha * (1 - beta))
    sq = np.sqrt(1 - 2 * rho * z + z * z)
    xz = np.log((sq + z - rho) / (1 - rho))
    small = np.abs(z) < 1e-7
    with np.errstate(divide="ignore", invalid="ignore"):
        lead = np.where(small, 0.0, nu * lfk / np.where(small, 1.0, xz))
    # ATM / small-z limit: ν ln(F/K)/x(z) → α · ln(F/K)/(F^{1−β} − K^{1−β}) · (1−β) → α / F^{1−β}
    if abs(1 - beta) < 1e-12:
        atm_lead = np.full_like(K, alpha)
    else:
        fk = (F * K) ** ((1 - beta) / 2)
        atm_lead = alpha / fk
    lead = np.where(small, atm_lead * (1 + rho * z / 2), lead)
    fkb = (F * K) ** (1 - beta)
    corr = 1 + ((1 - beta) ** 2 * alpha ** 2 / (24 * fkb) + rho * beta * nu * alpha / (4 * np.sqrt(fkb))
                + (2 - 3 * rho ** 2) * nu ** 2 / 24) * T
    return lead * corr


def calibrate_sabr(strikes, vols, F, T, beta=1.0, weights=None):
    """Least-squares fit of (α, ρ, ν) for fixed β. Returns params and fit error (vol)."""
    K = np.asarray(strikes, float)
    v = np.asarray(vols, float)
    w = np.ones_like(v) if weights is None else np.asarray(weights, float)
    atm = float(np.interp(F, K[np.argsort(K)], v[np.argsort(K)]))
    a0 = atm * F ** (1 - beta)

    def resid(p):
        a, r, n = p
        return np.sqrt(w) * (sabr_vol(K, F, T, a, beta, r, n) - v)

    best = None
    for r0 in (-0.5, 0.0, 0.4):
        for n0 in (0.3, 1.0, 2.0):
            sol = least_squares(resid, [a0, r0, n0], bounds=([a0 * 0.2, -0.999, 1e-3], [a0 * 5, 0.999, 10.0]))
            if best is None or sol.cost < best.cost:
                best = sol
    a, r, n = best.x
    err = sabr_vol(K, F, T, a, beta, r, n) - v
    return {"alpha": float(a), "beta": float(beta), "rho": float(r), "nu": float(n),
            "rmse_vol": float(np.sqrt(np.mean(err ** 2))), "max_err_vol": float(np.max(np.abs(err)))}


def _bs(F, K, T, sig, call):
    sq = sig * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * sq * sq) / sq
    delta = norm.cdf(d1) if call else norm.cdf(d1) - 1
    vega = F * norm.pdf(d1) * np.sqrt(T)
    return delta, vega


def hedge_ratios(K, F, T, p, call=True):
    """Forward deltas under the four smile-dynamics rules (per unit of forward)."""
    a, b, r, n = p["alpha"], p["beta"], p["rho"], p["nu"]
    sig = float(sabr_vol(K, F, T, a, b, r, n))
    d_bs, vega = _bs(F, K, T, sig, call)
    hF, hK, ha = F * 1e-4, K * 1e-4, a * 1e-4
    dsdF = (sabr_vol(K, F + hF, T, a, b, r, n) - sabr_vol(K, F - hF, T, a, b, r, n)) / (2 * hF)
    dsdK = (sabr_vol(K + hK, F, T, a, b, r, n) - sabr_vol(K - hK, F, T, a, b, r, n)) / (2 * hK)
    dsda = (sabr_vol(K, F, T, a + ha, b, r, n) - sabr_vol(K, F, T, a - ha, b, r, n)) / (2 * ha)
    sticky_delta = d_bs - vega * dsdK * K / F
    sabr = d_bs + vega * dsdF
    bartlett = sabr + vega * dsda * r * n / F ** b
    return {"strike": float(K), "vol": sig, "bs_sticky_strike": float(d_bs), "sticky_delta": float(sticky_delta),
            "sabr": float(sabr), "bartlett": float(bartlett), "vega": float(vega),
            "bartlett_minus_bs": float(bartlett - d_bs)}


def strike_for_delta(F, T, p, target, call=True):
    """Strike with BS forward delta = target on the SABR smile (bisection on log-moneyness)."""
    lo, hi = np.log(F) - 8 * p["alpha"] * F ** (p["beta"] - 1) * np.sqrt(T), np.log(F) + 8 * p["alpha"] * F ** (p["beta"] - 1) * np.sqrt(T)
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        K = np.exp(mid)
        d, _ = _bs(F, K, T, float(sabr_vol(K, F, T, p["alpha"], p["beta"], p["rho"], p["nu"])), call)
        # Call delta falls as K rises; |put delta| rises as K rises.
        if (d > target) if call else (abs(d) < target):
            lo = mid
        else:
            hi = mid
    return float(np.exp(0.5 * (lo + hi)))


def backbone(F, T, p):
    """ATM-vol change (vol points) per +1 % forward move under each rule."""
    a, b, r, n = p["alpha"], p["beta"], p["rho"], p["nu"]
    atm = float(sabr_vol(F, F, T, a, b, r, n))
    F1 = F * 1.01
    sticky_strike = float(sabr_vol(F1, F, T, a, b, r, n)) - atm          # old smile read at the new ATM strike
    sabr = float(sabr_vol(F1, F1, T, a, b, r, n)) - atm                   # α fixed
    # Bartlett: α co-moves with F, E[dα | dF] = ρ ν dF / F^β (from dF = α F^β dW, dα = ν α dZ).
    a1 = a + r * n / F ** b * (F1 - F)
    bartlett = float(sabr_vol(F1, F1, T, a1, b, r, n)) - atm
    return {"atm_vol": atm, "sticky_strike": sticky_strike * 100, "sticky_delta": 0.0,
            "sabr": sabr * 100, "bartlett": bartlett * 100}


def empirical_beta(dates, closes, iv_dates, iv_levels, window=90):
    """Regress d ln IV on d ln S (daily, common dates). Returns full-sample and rolling stats."""
    iv = {str(d)[:10]: float(v) for d, v in zip(iv_dates, iv_levels) if v and v > 0}
    px = {str(d)[:10]: float(c) for d, c in zip(dates, closes)}
    common = sorted(set(iv) & set(px))
    if len(common) < window + 10:
        return None
    s = np.log([px[d] for d in common])
    v = np.log([iv[d] for d in common])
    r, dv = np.diff(s), np.diff(v)
    iv_last = np.exp(v[-1])

    def fit(x, y):
        b = np.cov(x, y)[0, 1] / np.var(x, ddof=1)
        return float(b), float(np.corrcoef(x, y)[0, 1])

    b_all, c_all = fit(r, dv)
    b_w, c_w = fit(r[-window:], dv[-window:])
    roll = []
    for i in range(window, len(r) + 1, 5):
        b, c = fit(r[i - window:i], dv[i - window:i])
        roll.append({"date": common[i], "beta": b, "corr": c})
    # Vol points of the index per +1 % spot move (beta is in log terms).
    return {"beta_full": b_all, "corr_full": c_all, "beta_recent": b_w, "corr_recent": c_w,
            "volpts_per_1pct_recent": float(b_w * 0.01 * iv_last), "iv_last": float(iv_last),
            "window": window, "rolling": roll, "n": int(len(r))}


def classify_regime(model_bb, emp_volpts):
    """Which smile-dynamics rule the realised spot-vol beta is closest to."""
    if emp_volpts is None:
        return None
    cands = {k: model_bb[k] for k in ("sticky_strike", "sticky_delta", "bartlett")}
    best = min(cands, key=lambda k: abs(cands[k] - emp_volpts))
    return {"closest": best, "distance_volpts": float(abs(cands[best] - emp_volpts))}
