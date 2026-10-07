"""
jump_models.py — Merton jump-diffusion and Bates (stochastic vol + jumps) pricing,
calibrated to a listed option smile, with risk-neutral densities and jump-risk
statistics.

All prices are forward (undiscounted, "Black-76") prices, so the same code works for
Deribit coin-margined options (quoted on the forward) and for FX / metals once the
forward F = S·e^{(r_d − r_f)T} is supplied.

Merton (1976): log-normal jumps, intensity λ, log-jump ~ N(μ_J, δ²), k = e^{μ_J+δ²/2} − 1.
    C = Σ_n e^{−λT}(λT)^n/n! · Black(F_n, K, σ_n, T),
    σ_n² = σ² + nδ²/T,  F_n = E[S_T | n jumps] = F·e^{−λkT}(1+k)^n
    (forward form of Merton's series; the familiar λ' = λ(1+k) weights belong to the
    spot form with the adjusted rate r_n).

Bates (1996): Heston (1993) variance + Merton jumps. Characteristic function of
x = ln(S_T/F) in the rotation-count-safe form (Albrecher et al. 2007, "little Heston trap"):
    d = √((ρξiu − κ)² + ξ²(iu + u²)),   g = (κ − ρξiu − d)/(κ − ρξiu + d)
    C = κθ/ξ²·[(κ − ρξiu − d)T − 2 ln((1 − g e^{−dT})/(1 − g))]
    D = (κ − ρξiu − d)/ξ² · (1 − e^{−dT})/(1 − g e^{−dT})
    J = λT(e^{iuμ_J − u²δ²/2} − 1) − iu·λkT
    φ(u) = exp(C + D·v₀ + J)
Puts are priced with the COS method (Fang & Oosterlee 2008), calls by parity; the
same expansion gives the risk-neutral density.

Calibration minimises vega-weighted price errors (≈ implied-vol errors) across all
expiries with bounded least squares from several starts.

References:
    Merton, R. (1976). J. Financial Economics, 3, 125–144.
    Heston, S. (1993). Review of Financial Studies, 6(2), 327–343.
    Bates, D. (1996). Review of Financial Studies, 9(1), 69–107.
    Albrecher, H., Mayer, P., Schoutens, W. & Tistaert, J. (2007). Wilmott Magazine, Jan.
    Fang, F. & Oosterlee, C. (2008). SIAM J. Sci. Comput., 31(2), 826–848.
"""

import numpy as np
from scipy.optimize import brentq, least_squares
from scipy.special import gammaln
from scipy.stats import norm

N_COS = 256


# ─── Black-76 on the forward ──────────────────────────────────────────────────

def black(F, K, T, sigma, is_call=True):
    F, K, sigma = np.asarray(F, float), np.asarray(K, float), np.asarray(sigma, float)
    sq = np.maximum(sigma * np.sqrt(T), 1e-12)
    d1 = (np.log(F / K) + 0.5 * sq ** 2) / sq
    d2 = d1 - sq
    c = F * norm.cdf(d1) - K * norm.cdf(d2)
    return c if is_call else c - (F - K)


def black_vega(F, K, T, sigma):
    sq = np.maximum(sigma * np.sqrt(T), 1e-12)
    d1 = (np.log(F / K) + 0.5 * sq ** 2) / sq
    return F * norm.pdf(d1) * np.sqrt(T)


def implied_vol(price, F, K, T, is_call=True):
    """Black-76 implied vol by bracketing root search (NaN outside no-arbitrage bounds)."""
    Ks = np.atleast_1d(np.asarray(K, float))
    out = np.full(Ks.shape, np.nan)
    for i, (p, k) in enumerate(zip(np.broadcast_to(np.atleast_1d(price), Ks.shape), Ks)):
        intrinsic = max(F - k, 0.0) if is_call else max(k - F, 0.0)
        if not (intrinsic + 1e-12 * F < p < (F if is_call else k)):
            continue
        try:
            out[i] = brentq(lambda s: float(black(F, k, T, s, is_call)) - p, 1e-4, 10.0, xtol=1e-8)
        except ValueError:
            pass
    return out


# ─── Merton ───────────────────────────────────────────────────────────────────

def merton_price(F, K, T, sigma, lam, mu_j, delta, is_call=True, n_terms=60):
    K = np.asarray(K, float)
    k = np.exp(mu_j + 0.5 * delta ** 2) - 1
    lt = lam * T
    n = np.arange(n_terms)
    logw = -lt + n * np.log(max(lt, 1e-300)) - gammaln(n + 1) if lt > 0 else np.where(n == 0, 0.0, -np.inf)
    w = np.exp(logw)
    sig_n = np.sqrt(sigma ** 2 + n * delta ** 2 / T)
    F_n = F * np.exp(-lam * k * T + n * np.log1p(k))
    prices = black(F_n[:, None], K[None, :], T, sig_n[:, None], True)
    c = (w[:, None] * prices).sum(axis=0)
    return c if is_call else c - (F - K)


# ─── Bates characteristic function & COS ─────────────────────────────────────

def bates_cf(u, T, v0, kappa, theta, xi, rho, lam, mu_j, delta):
    """φ(u) = E[e^{iu·ln(S_T/F)}] under the forward measure."""
    u = np.asarray(u, dtype=complex)
    iu = 1j * u
    b = kappa - rho * xi * iu
    d = np.sqrt(b ** 2 + xi ** 2 * (iu + u ** 2))
    g = (b - d) / (b + d)
    edt = np.exp(-d * T)
    C = kappa * theta / xi ** 2 * ((b - d) * T - 2 * np.log((1 - g * edt) / (1 - g)))
    D = (b - d) / xi ** 2 * (1 - edt) / (1 - g * edt)
    k = np.exp(mu_j + 0.5 * delta ** 2) - 1
    J = lam * T * (np.exp(iu * mu_j - 0.5 * u ** 2 * delta ** 2) - 1) - iu * lam * k * T
    return np.exp(C + D * v0 + J)


def _cos_range(T, v0, theta, lam, mu_j, delta, L=12.0):
    var = max(v0, theta) * T + lam * T * (mu_j ** 2 + delta ** 2)
    c1 = -0.5 * var + lam * T * mu_j
    sd = np.sqrt(max(var, 1e-8))
    return c1 - L * sd, c1 + L * sd


def bates_price(F, K, T, params, is_call=True, N=N_COS):
    """Forward prices of European options on many strikes via COS (puts + parity)."""
    v0, kappa, theta, xi, rho, lam, mu_j, delta = params
    K = np.atleast_1d(np.asarray(K, float))
    a, b = _cos_range(T, v0, theta, lam, mu_j, delta)
    k = np.arange(N)
    u = k * np.pi / (b - a)
    phi = bates_cf(u, T, v0, kappa, theta, xi, rho, lam, mu_j, delta)
    # Put payoff K(1 − e^y)^+ on y = ln(S_T/K) ∈ [a', 0]; work in x = ln(S_T/F) shifted by x0.
    x0 = np.log(F / K)                                          # per strike
    # Cosine coefficients of the put payoff on [a, b] in y = x0 + x (Fang & Oosterlee eq. 24/25).
    lo, hi = a, 0.0

    def chi(c, d):
        uk = u
        return (np.cos(uk * (d - a)) * np.exp(d) - np.cos(uk * (c - a)) * np.exp(c)
                + uk * np.sin(uk * (d - a)) * np.exp(d) - uk * np.sin(uk * (c - a)) * np.exp(c)) / (1 + uk ** 2)

    def psi(c, d):
        out = np.empty_like(u)
        out[0] = d - c
        out[1:] = (np.sin(u[1:] * (d - a)) - np.sin(u[1:] * (c - a))) / u[1:]
        return out

    Vk = 2.0 / (b - a) * (-chi(lo, hi) + psi(lo, hi))           # per unit strike
    terms = (phi[None, :] * np.exp(1j * u[None, :] * (x0[:, None] - a))).real * Vk[None, :]
    terms[:, 0] *= 0.5
    put = K * terms.sum(axis=1)
    put = np.maximum(put, np.maximum(K - F, 0.0))
    return put + (F - K) if is_call else put


def bates_density(T, params, x_grid, N=N_COS):
    """Risk-neutral density of x = ln(S_T/F) on x_grid (COS series)."""
    v0, kappa, theta, xi, rho, lam, mu_j, delta = params
    a, b = _cos_range(T, v0, theta, lam, mu_j, delta)
    u = np.arange(N) * np.pi / (b - a)
    phi = bates_cf(u, T, v0, kappa, theta, xi, rho, lam, mu_j, delta)
    coef = 2.0 / (b - a) * (phi * np.exp(-1j * u * a)).real
    coef[0] *= 0.5
    dens = (coef[None, :] * np.cos(u[None, :] * (np.asarray(x_grid)[:, None] - a))).sum(axis=1)
    return np.maximum(dens, 0.0)


def merton_as_bates(sigma, lam, mu_j, delta):
    """Bates parameters that reproduce Merton (constant variance, negligible vol-of-vol)."""
    return (sigma ** 2, 5.0, sigma ** 2, 1e-4, 0.0, lam, mu_j, delta)


# ─── calibration ──────────────────────────────────────────────────────────────

MERTON_BOUNDS = ([0.05, 0.0, -0.5, 0.005], [3.0, 50.0, 0.3, 0.6])
BATES_BOUNDS = ([0.004, 0.2, 0.004, 0.05, -0.95, 0.0, -0.5, 0.005],
                [4.0, 20.0, 4.0, 5.0, 0.95, 30.0, 0.3, 0.6])
BATES_NAMES = ["v0", "kappa", "theta", "xi", "rho", "lambda", "mu_j", "delta"]
MERTON_NAMES = ["sigma", "lambda", "mu_j", "delta"]


def _otm(F, K, T, iv):
    """OTM forward price (calls above F, puts below) and Black vega for weighting."""
    is_call = K >= F
    p = np.where(is_call, black(F, K, T, iv, True), black(F, K, T, iv, False))
    return p, is_call, np.maximum(black_vega(F, K, T, iv), 1e-6 * F)


def _model_prices(model, p, F, K, T, is_call):
    if model == "merton":
        c = merton_price(F, K, T, *p)
    else:
        c = bates_price(F, K, T, p)
    return np.where(is_call, c, c - (F - K))


def calibrate(expiries, model="bates", starts=None):
    """
    expiries: list of {"T", "forward", "strikes", "iv"} (iv as decimals).
    Returns fitted params (dict), RMSE in vol points per expiry and overall.
    """
    data = []
    for e in expiries:
        F, T = float(e["forward"]), float(e["T"])
        K, iv = np.asarray(e["strikes"], float), np.asarray(e["iv"], float)
        mny = np.abs(np.log(K / F)) / (np.median(iv) * np.sqrt(T))
        keep = mny < 3.0                                   # drop far wings beyond ~3 sd
        if keep.sum() < 4:
            continue
        p, is_call, vega = _otm(F, K[keep], T, iv[keep])
        data.append((F, T, K[keep], iv[keep], p, is_call, vega))
    if not data:
        raise ValueError("no usable expiries")

    def resid(x):
        out = []
        for F, T, K, iv, p, is_call, vega in data:
            out.append((_model_prices(model, x, F, K, T, is_call) - p) / vega)
        return np.concatenate(out)

    atm = float(np.median([np.interp(0, np.log(d[2] / d[0]), d[3]) for d in data]))
    if model == "merton":
        lb, ub = MERTON_BOUNDS
        starts = starts or [[atm * 0.9, 1.0, -0.05, 0.10], [atm * 0.7, 5.0, -0.02, 0.08],
                            [atm * 0.8, 0.5, -0.15, 0.15]]
    else:
        lb, ub = BATES_BOUNDS
        v = atm ** 2
        starts = starts or [[v, 2.0, v, 1.0, -0.3, 1.0, -0.05, 0.10],
                            [v, 5.0, v, 2.0, 0.0, 3.0, -0.03, 0.08],
                            [v, 1.0, v * 1.2, 0.6, -0.6, 0.3, -0.15, 0.15]]
    best = None
    for x0 in starts:
        x0 = np.clip(x0, np.array(lb) + 1e-6, np.array(ub) - 1e-6)
        try:
            res = least_squares(resid, x0, bounds=(lb, ub), method="trf", x_scale="jac",
                                max_nfev=400 if model == "bates" else 600)
        except (ValueError, FloatingPointError):
            continue
        if best is None or res.cost < best.cost:
            best = res
    if best is None:
        raise ValueError("calibration failed")
    x = best.x

    per_exp, all_err = [], []
    for F, T, K, iv, p, is_call, vega in data:
        mp = _model_prices(model, x, F, K, T, is_call)
        miv = np.array([implied_vol(m, F, k, T, c)[0] for m, k, c in zip(mp, K, is_call)])
        err = miv - iv
        err = err[np.isfinite(err)]
        all_err.extend(err.tolist())
        per_exp.append({"T": T, "rmse_vol": float(np.sqrt(np.mean(err ** 2))) if len(err) else None})
    names = MERTON_NAMES if model == "merton" else BATES_NAMES
    return {"model": model, "params": dict(zip(names, map(float, x))),
            "rmse_vol": float(np.sqrt(np.mean(np.square(all_err)))) if all_err else None,
            "per_expiry": per_exp, "n_quotes": int(sum(len(d[2]) for d in data))}


def model_smile(model, params, F, T, strikes):
    """Model implied vols on a strike grid (OTM prices inverted)."""
    K = np.asarray(strikes, float)
    p = [params[n] for n in (MERTON_NAMES if model == "merton" else BATES_NAMES)]
    is_call = K >= F
    mp = _model_prices(model, p, F, K, T, is_call)
    return np.array([implied_vol(m, F, k, T, c)[0] for m, k, c in zip(mp, K, is_call)])


def jump_stats(params, T=30 / 365, crash=-0.10, model="bates"):
    """Jump-risk read-outs: jumps/yr, P(≥1 jump worse than `crash` within T), jump share of variance."""
    lam, mu, d = params["lambda"], params["mu_j"], params["delta"]
    p_bad = norm.cdf((np.log1p(crash) - mu) / d) if d > 0 else float(mu < np.log1p(crash))
    jump_var = lam * (mu ** 2 + d ** 2)
    diff_var = params["sigma"] ** 2 if model == "merton" else params["theta"]
    return {
        "jumps_per_year": lam,
        "mean_jump_pct": float((np.exp(mu + 0.5 * d ** 2) - 1) * 100),
        "jump_sd_pct": float(d * 100),
        "p_crash_jump": float(1 - np.exp(-lam * T * p_bad)),
        "jump_variance_share": float(jump_var / (jump_var + diff_var)),
        "horizon_days": round(T * 365, 1),
        "crash_threshold_pct": crash * 100,
    }


def density_report(params, model, T, F, n=241):
    """Risk-neutral density of S_T vs a lognormal with the same ATM variance."""
    p = [params[k] for k in (MERTON_NAMES if model == "merton" else BATES_NAMES)]
    bp = merton_as_bates(*p) if model == "merton" else p
    v = bp[0] * T + bp[5] * T * (bp[6] ** 2 + bp[7] ** 2)
    sd = np.sqrt(max(v, 1e-8))
    x = np.linspace(-5 * sd, 4 * sd, n)
    f = bates_density(T, bp, x)
    dx = x[1] - x[0]
    lognormal = norm.pdf(x, -0.5 * v, sd)
    cdf = np.cumsum(f) * dx
    return {
        "spot": (F * np.exp(x)).tolist(), "density": (f / (F * np.exp(x))).tolist(),
        "lognormal": (lognormal / (F * np.exp(x))).tolist(),
        "p_down_20": float(np.interp(np.log(0.8), x, cdf)),
        "p_down_20_lognormal": float(norm.cdf(np.log(0.8), -0.5 * v, sd)),
        "p_up_20": float(1 - np.interp(np.log(1.2), x, cdf)),
        "p_up_20_lognormal": float(1 - norm.cdf(np.log(1.2), -0.5 * v, sd)),
    }
