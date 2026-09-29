"""
vol_analytics.py — Realised-vs-implied volatility toolkit for volatile assets
(BTC, ETH, XAU, XAG, FX).

1. Volatility cone (Burghardt & Lane 1990): distribution of rolling close-to-close
   realised vol for several horizons, so a vol level can be judged against what
   the asset has actually delivered over comparable windows.
       σ_RV(n) = sqrt(ppy / n · Σ r_i²)   (zero-mean estimator, r = log returns)
   ppy = 365 for 24/7 crypto, 252 for 24/5 FX & metals.

2. Listed-option surface (Deribit BTC/ETH): each expiry's mark IVs are fitted with
   Gatheral's raw SVI total-variance smile
       w(k) = a + b·(ρ·(k − m) + sqrt((k − m)² + σ²)),   k = ln(K/F),  w = σ_imp²·T
   and checked for butterfly arbitrage with Durrleman's condition g(k) ≥ 0
   (Gatheral & Jacquier 2014). ATM (k = 0), 25Δ risk reversal and 25Δ butterfly are
   then read off the fit using Black-76 forward deltas (Deribit options are
   quoted on the forward/future, delta not premium-adjusted here).

3. Vol risk premium: 30-day constant-maturity ATM IV (linear in total variance
   across expiries) minus 30-day realised vol.

References:
    Burghardt, G. & Lane, M. (1990). "How to tell if options are cheap."
        Journal of Portfolio Management, 16(2), 72–78.
    Gatheral, J. (2004). "A parsimonious arbitrage-free implied volatility
        parameterization..." Global Derivatives & Risk Management, Madrid.
    Gatheral, J. & Jacquier, A. (2014). "Arbitrage-free SVI volatility surfaces."
        Quantitative Finance, 14(1), 59–71.
    Carr, P. & Wu, L. (2009). "Variance risk premiums." Review of Financial
        Studies, 22(3), 1311–1341.
"""

from datetime import datetime, timezone

import numpy as np
from scipy.optimize import brentq, least_squares
from scipy.stats import norm

# Cone horizons in calendar days → bars via the asset's observation calendar.
CONE_TENORS = [("1W", 7), ("2W", 14), ("1M", 30), ("2M", 60), ("3M", 91), ("6M", 182)]
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])}
_YEAR_MS = 365.0 * 24 * 3600 * 1000


# ─── 1. Realised volatility cone ──────────────────────────────────────────────

def rolling_realised_vol(log_returns: np.ndarray, window: int, ppy: int) -> np.ndarray:
    """Annualised zero-mean rolling realised vol for every full window."""
    r2 = np.asarray(log_returns, dtype=float) ** 2
    if len(r2) < window:
        return np.array([])
    csum = np.concatenate([[0.0], np.cumsum(r2)])
    return np.sqrt((csum[window:] - csum[:-window]) * ppy / window)


def vol_cone(closes, ppy: int = 252) -> dict:
    """Percentile bands of rolling realised vol per horizon plus the current reading."""
    px = np.asarray(closes, dtype=float)
    px = px[np.isfinite(px) & (px > 0)]
    rets = np.diff(np.log(px))
    tenors = []
    for label, days in CONE_TENORS:
        window = max(2, int(round(days * ppy / 365)))
        rv = rolling_realised_vol(rets, window, ppy)
        if len(rv) < 20:          # need a meaningful distribution
            continue
        pct = np.percentile(rv, [0, 10, 25, 50, 75, 90, 100])
        current = float(rv[-1])
        tenors.append({
            "tenor": label, "days": days, "window": window,
            "min": pct[0], "p10": pct[1], "p25": pct[2], "median": pct[3],
            "p75": pct[4], "p90": pct[5], "max": pct[6],
            "current": current,
            "current_percentile": float((rv < current).mean() * 100),
        })
    # EWMA (RiskMetrics λ=0.94) one-step forecast for context.
    ewma = None
    if len(rets) >= 30:
        var = float(np.var(rets[:30]))
        for r in rets[30:]:
            var = 0.94 * var + 0.06 * r * r
        ewma = float(np.sqrt(var * ppy))
    return {
        "periods_per_year": ppy,
        "n_returns": int(len(rets)),
        "ewma_vol": ewma,
        "tenors": [{k: (round(v, 6) if isinstance(v, float) else v) for k, v in t.items()}
                   for t in tenors],
    }


# ─── 2. Deribit option surface ────────────────────────────────────────────────

def parse_deribit_instrument(name: str):
    """'BTC-27DEC24-60000-C' → (expiry datetime 08:00 UTC, strike, 'call'|'put') or None."""
    try:
        _, exp, strike, cp = name.split("-")
        day, mon, yr = int(exp[:-5]), _MONTHS[exp[-5:-2]], 2000 + int(exp[-2:])
        expiry = datetime(yr, mon, day, 8, 0, tzinfo=timezone.utc)
        strike = float(strike.replace("d", "."))
        return expiry, strike, ("call" if cp.upper() == "C" else "put")
    except (ValueError, KeyError):
        return None


def svi_total_variance(k, a, b, rho, m, sig):
    k = np.asarray(k, dtype=float)
    return a + b * (rho * (k - m) + np.sqrt((k - m) ** 2 + sig ** 2))


def svi_butterfly_ok(params, k_lo=-1.5, k_hi=1.5, n=301) -> bool:
    """Durrleman's condition g(k) ≥ 0 on a grid (no butterfly arbitrage) and w > 0."""
    a, b, rho, m, sig = params
    k = np.linspace(k_lo, k_hi, n)
    x = k - m
    root = np.sqrt(x ** 2 + sig ** 2)
    w = a + b * (rho * x + root)
    w1 = b * (rho + x / root)
    w2 = b * sig ** 2 / root ** 3
    if np.any(w <= 0):
        return False
    g = (1 - k * w1 / (2 * w)) ** 2 - (w1 ** 2 / 4) * (1 / w + 0.25) + w2 / 2
    return bool(np.all(g >= -1e-9))


def fit_svi(k, iv, T):
    """Least-squares raw-SVI fit in implied-vol space. Returns (params, rmse_vol)."""
    k = np.asarray(k, dtype=float)
    iv = np.asarray(iv, dtype=float)
    w_mkt = iv ** 2 * T
    wmax = float(w_mkt.max())
    kspan = float(max(k.max() - k.min(), 0.05))

    def resid(p):
        a, b, rho, m, sig = p
        w = svi_total_variance(k, a, b, rho, m, sig)
        model_iv = np.sqrt(np.maximum(w, 1e-10) / T)
        # Penalise a negative variance minimum: a + b·σ·sqrt(1−ρ²) ≥ 0.
        floor = min(0.0, a + b * sig * np.sqrt(1 - rho ** 2))
        return np.append(model_iv - iv, 10.0 * floor)

    lo = [-wmax, 0.0, -0.999, float(k.min()) - kspan, 1e-3]
    hi = [wmax, 10.0 * wmax / max(kspan, 1e-3) + 1.0, 0.999, float(k.max()) + kspan, 2.0]
    atm_w = float(np.interp(0.0, np.sort(k), w_mkt[np.argsort(k)]))
    best = None
    for rho0 in (-0.5, 0.0, 0.5):
        for sig0 in (0.05, 0.2):
            x0 = np.clip([0.5 * atm_w, 0.1 * wmax / sig0 + 1e-4, rho0, 0.0, sig0], lo, hi)
            try:
                res = least_squares(resid, x0, bounds=(lo, hi), method="trf", max_nfev=2000)
            except ValueError:
                continue
            if best is None or res.cost < best.cost:
                best = res
    params = tuple(float(v) for v in best.x)
    rmse = float(np.sqrt(np.mean(best.fun[:-1] ** 2)))
    return params, rmse


def _svi_vol(params, k, T):
    return float(np.sqrt(max(svi_total_variance(k, *params), 1e-10) / T))


def _k_for_forward_delta(params, T, target):
    """Log-moneyness where the Black-76 forward call delta N(d1) equals target."""
    def f(k):
        s = _svi_vol(params, k, T)
        d1 = (-k + 0.5 * s * s * T) / (s * np.sqrt(T))
        return norm.cdf(d1) - target
    return brentq(f, -5.0, 5.0)


def build_crypto_surface(summaries, now_ms: float, min_points: int = 5,
                         min_days: float = 1.0) -> list:
    """
    Group Deribit option book summaries by expiry and fit an SVI smile to each.
    Uses out-of-the-money mark IVs only (calls K ≥ F, puts K < F).
    """
    by_exp = {}
    for row in summaries:
        parsed = parse_deribit_instrument(row.get("instrument_name", ""))
        iv = row.get("mark_iv")
        F = row.get("underlying_price")
        if not parsed or not iv or not F or iv <= 0 or F <= 0:
            continue
        expiry, K, cp = parsed
        by_exp.setdefault(expiry, []).append((K, cp, iv / 100.0, float(F),
                                              float(row.get("open_interest") or 0)))

    expiries = []
    for expiry, rows in sorted(by_exp.items()):
        T = (expiry.timestamp() * 1000 - now_ms) / _YEAR_MS
        if T * 365 < min_days:
            continue
        F = float(np.median([r[3] for r in rows]))
        otm = {}
        for K, cp, iv, _, oi in rows:
            if (cp == "call" and K >= F) or (cp == "put" and K < F):
                otm[K] = (iv, oi)
        if len(otm) < min_points:
            continue
        strikes = np.array(sorted(otm))
        ivs = np.array([otm[K][0] for K in strikes])
        k = np.log(strikes / F)
        try:
            params, rmse = fit_svi(k, ivs, T)
        except Exception:
            continue
        atm = _svi_vol(params, 0.0, T)
        try:
            k25c = _k_for_forward_delta(params, T, 0.25)
            k25p = _k_for_forward_delta(params, T, 0.75)
            v25c, v25p = _svi_vol(params, k25c, T), _svi_vol(params, k25p, T)
            rr25, bf25 = v25c - v25p, 0.5 * (v25c + v25p) - atm
            K25c, K25p = F * np.exp(k25c), F * np.exp(k25p)
        except ValueError:
            v25c = v25p = rr25 = bf25 = K25c = K25p = None
        k_grid = np.linspace(k.min(), k.max(), 60)
        expiries.append({
            "expiry": expiry.strftime("%Y-%m-%d"),
            "label": expiry.strftime("%d%b%y").upper(),
            "days": round(T * 365, 2), "T": round(T, 6), "forward": round(F, 4),
            "atm_vol": atm, "rr25": rr25, "bf25": bf25,
            "vol_25c": v25c, "vol_25p": v25p, "K_25c": K25c, "K_25p": K25p,
            "svi": dict(zip(["a", "b", "rho", "m", "sigma"], params)),
            "fit_rmse": rmse,
            "butterfly_arb_free": svi_butterfly_ok(params),
            "open_interest": float(sum(v[1] for v in otm.values())),
            "market": {"strikes": strikes.tolist(), "iv": ivs.tolist()},
            "fit": {"strikes": (F * np.exp(k_grid)).tolist(),
                    "iv": [_svi_vol(params, x, T) for x in k_grid]},
        })
    return expiries


def constant_maturity_atm(expiries: list, days: float):
    """ATM vol at a fixed tenor, linear in total variance between listed expiries."""
    pts = sorted((e["T"], e["atm_vol"] ** 2 * e["T"]) for e in expiries)
    if not pts:
        return None
    T = days / 365.0
    Ts, ws = zip(*pts)
    if T <= Ts[0]:
        return float(np.sqrt(ws[0] / Ts[0]))
    if T >= Ts[-1]:
        return float(np.sqrt(ws[-1] / Ts[-1]))
    return float(np.sqrt(np.interp(T, Ts, ws) / T))


def _round_floats(obj, nd=6):
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, dict):
        return {k: _round_floats(v, nd) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_floats(v, nd) for v in obj]
    return obj


def crypto_vol_report(summaries, now_ms, index_price=None, dvol_series=None,
                      closes=None) -> dict:
    """Full surface + term structure + cone + VRP for BTC or ETH."""
    expiries = build_crypto_surface(summaries, now_ms)
    cone = vol_cone(closes, 365) if closes is not None and len(closes) > 40 else None
    iv30 = constant_maturity_atm(expiries, 30)
    rv30 = None
    if cone:
        rv30 = next((t["current"] for t in cone["tenors"] if t["tenor"] == "1M"), None)
    term = [{"tenor": lbl, "days": d, "atm_vol": constant_maturity_atm(expiries, d)}
            for lbl, d in CONE_TENORS] if expiries else []
    dvol = None
    if dvol_series:
        dvol = {"last": dvol_series[-1][4] / 100.0,
                "series": [[p[0], p[4] / 100.0] for p in dvol_series]}
    return _round_floats({
        "index_price": index_price,
        "dvol": dvol,
        "iv_30d": iv30,
        "rv_30d": rv30,
        "vrp_30d": (iv30 - rv30) if iv30 is not None and rv30 is not None else None,
        "atm_term_structure": term,
        "expiries": expiries,
        "cone": cone,
    })
