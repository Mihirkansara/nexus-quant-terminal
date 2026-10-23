"""
risk_desk.py — Market risk for an FX / metals / crypto option book: full-revaluation
VaR and Expected Shortfall under four methods, stressed VaR, regulatory backtesting,
a spot × vol ladder and Greek P&L explain.

Risk factors: spot log-return r and the log-change of an implied-vol index d ln IV
(Deribit DVOL for BTC/ETH, Cboe GVZ for gold, VXSLV for silver; otherwise an EWMA
realised-vol proxy). Scenarios move the book's vol proportionally,
σ' = σ · exp(d ln IV) — a parallel, sticky-strike shift of the smile.

Methods
  HS   — historical simulation, full revaluation of every leg (Basel "full reval").
  FHS  — filtered HS (Barone-Adesi, Giannopoulos & Vosper 1999; Hull & White 1998):
         each historical shock is rescaled by σ_EWMA(now) / σ_EWMA(t), so the
         scenario set reflects today's volatility regime (λ = 0.94, RiskMetrics).
  ΔΓ-CF— delta-gamma-vega Taylor P&L with Cornish-Fisher quantiles (Zangari 1996)
         from the moments of the quadratic P&L under EWMA-covariance normal factors.
  MC-t — Monte Carlo, Student-t(ν=4) factors with the EWMA covariance, full reval.

ES at 97.5 % is the FRTB (BCBS 2019, MAR33) measure; VaR 99 % / 10-day is Basel 2.5.
Stressed VaR / ES: the 250-day window of history that maximises the book's ES
(BCBS 2009 "stressed VaR"). Backtest: rolling one-day 99 % FHS VaR against the
book's realised P&L, Kupiec (1995) POF and Christoffersen (1998) independence
likelihood ratios and the Basel traffic-light zones (green ≤ 4, amber 5–9,
red ≥ 10 exceptions per 250 days).
"""

import numpy as np
from scipy.stats import chi2, norm

from .exotics import gk_vanilla

LAM = 0.94
VOL_FLOOR = 0.01


# ─── book valuation & Greeks ─────────────────────────────────────────────────

def book_value(legs, S, sigma, r_d, r_f, dt=0.0):
    """Value of the book; S and sigma may be arrays (scenarios). dt = years elapsed."""
    S = np.asarray(S, float)
    sigma = np.maximum(np.asarray(sigma, float), VOL_FLOOR)
    total = np.zeros(np.broadcast(S, sigma).shape)
    for leg in legs:
        T = leg["T"] - dt
        call = leg["type"] == "call"
        if T <= 1e-6:
            pay = np.maximum(S - leg["K"], 0) if call else np.maximum(leg["K"] - S, 0)
            total = total + leg["qty"] * pay
        else:
            total = total + leg["qty"] * gk_vanilla(S, leg["K"], T, r_d, r_f, sigma, call)
    return total


def book_greeks(legs, S, sigma, r_d, r_f):
    """Finite-difference Greeks of the whole book (vol in decimals, theta per calendar day)."""
    hS, hv, dt = S * 1e-3, 1e-3, 1 / 365
    f = lambda s, v, t=0.0: float(book_value(legs, s, v, r_d, r_f, t))
    p0 = f(S, sigma)
    pu, pd = f(S + hS, sigma), f(S - hS, sigma)
    vu, vd = f(S, sigma + hv), f(S, sigma - hv)
    uu, ud = f(S + hS, sigma + hv), f(S + hS, sigma - hv)
    du, dd = f(S - hS, sigma + hv), f(S - hS, sigma - hv)
    return {"value": p0,
            "delta": (pu - pd) / (2 * hS),
            "gamma": (pu - 2 * p0 + pd) / hS ** 2,
            "vega": (vu - vd) / (2 * hv),                 # per 1.00 vol (×0.01 per vol point)
            "vanna": (uu - ud - du + dd) / (4 * hS * hv),
            "volga": (vu - 2 * p0 + vd) / hv ** 2,
            "theta": f(S, sigma, dt) - p0}                # per day


def pnl_explain(g, S, sigma, dS, dsig, days, full):
    """Taylor attribution of a full-revaluation P&L into Greek buckets + unexplained."""
    terms = {"delta": g["delta"] * dS, "gamma": 0.5 * g["gamma"] * dS ** 2,
             "vega": g["vega"] * dsig, "vanna": g["vanna"] * dS * dsig,
             "volga": 0.5 * g["volga"] * dsig ** 2, "theta": g["theta"] * days}
    terms["unexplained"] = full - sum(terms.values())
    return terms


# ─── factor history ──────────────────────────────────────────────────────────

def ewma_vol(x, lam=LAM, seed_n=30):
    """σ_t for each t using information up to t−1 (RiskMetrics recursion)."""
    x = np.asarray(x, float)
    v = np.empty(len(x))
    v[0] = np.var(x[:seed_n]) if len(x) >= seed_n else np.var(x)
    for t in range(1, len(x)):
        v[t] = lam * v[t - 1] + (1 - lam) * x[t - 1] ** 2
    return np.sqrt(np.maximum(v, 1e-18))


def align_factors(dates, closes, iv_dates=None, iv_levels=None, proxy_damp=0.5):
    """
    Daily factor history: spot log-returns and d ln IV on common dates.
    With no vol index, d ln IV is proxied by the change in log EWMA realised vol,
    damped (implied vol moves less than realised vol day to day).
    """
    d = [str(x)[:10] for x in dates]
    c = np.asarray(closes, float)
    r = np.diff(np.log(c))
    rd = d[1:]
    if iv_dates is not None and iv_levels is not None and len(iv_levels) > 60:
        iv = {str(a)[:10]: float(b) for a, b in zip(iv_dates, iv_levels) if b and b > 0}
        keep, dl, prev = [], [], None
        for i, day in enumerate(d):
            if day in iv:
                if prev is not None:
                    keep.append(i)
                    dl.append(np.log(iv[day] / iv[d[prev]]))
                prev = i
        if len(keep) > 250:
            idx = np.array(keep)
            prev_idx = np.r_[idx[0] - 1, idx[:-1]]       # spot move over the same interval as the IV change
            rr = np.log(c[idx] / c[prev_idx])
            return {"dates": [d[i] for i in idx], "r": rr, "dlv": np.array(dl), "vol_source": "index",
                    "iv_last": float(iv[d[idx[-1]]])}
    sig = ewma_vol(r)
    lv = np.log(np.r_[sig[1:], np.sqrt(LAM * sig[-1] ** 2 + (1 - LAM) * r[-1] ** 2)])
    dlv = proxy_damp * np.diff(np.r_[np.log(sig[0]), lv])
    return {"dates": rd, "r": r, "dlv": dlv, "vol_source": "proxy", "iv_last": None}


def horizon_sums(x, h):
    """Overlapping h-day sums (h = 1 returns x)."""
    if h <= 1:
        return np.asarray(x, float)
    c = np.r_[0.0, np.cumsum(x)]
    return c[h:] - c[:-h]


# ─── risk measures ───────────────────────────────────────────────────────────

def var_es(pnl, levels=(0.99, 0.975)):
    """Loss-positive VaR and ES from a P&L sample."""
    pnl = np.sort(np.asarray(pnl, float))
    out = {}
    for a in levels:
        q = np.quantile(pnl, 1 - a)
        tail = pnl[pnl <= q]
        out[f"var_{int(round(a * 1000))}"] = float(-q)
        out[f"es_{int(round(a * 1000))}"] = float(-tail.mean()) if len(tail) else float(-q)
    return out


def cornish_fisher(mean, sd, skew, kurt_ex, a):
    z = norm.ppf(1 - a)
    zc = (z + (z ** 2 - 1) * skew / 6 + (z ** 3 - 3 * z) * kurt_ex / 24
          - (2 * z ** 3 - 5 * z) * skew ** 2 / 36)
    return mean + sd * zc


def _scen_pnl(legs, S, sigma, r_d, r_f, r, dlv, days, v0):
    return book_value(legs, S * np.exp(r), sigma * np.exp(dlv), r_d, r_f, days / 365) - v0


def risk_report(legs, S, sigma, r_d, r_f, fac, horizon=1, n_mc=40000, seed=7, ppy=252):
    r, dlv = fac["r"], fac["dlv"]
    v0 = float(book_value(legs, S, sigma, r_d, r_f))
    g = book_greeks(legs, S, sigma, r_d, r_f)
    days = horizon * (365 / ppy)                       # calendar days elapsed over the horizon

    # HS
    rh, vh = horizon_sums(r, horizon), horizon_sums(dlv, horizon)
    pnl_hs = _scen_pnl(legs, S, sigma, r_d, r_f, rh, vh, days, v0)

    # FHS — rescale daily shocks to today's EWMA vol, then aggregate.
    sr, sv = ewma_vol(r), ewma_vol(dlv)
    now_r = np.sqrt(LAM * sr[-1] ** 2 + (1 - LAM) * r[-1] ** 2)
    now_v = np.sqrt(LAM * sv[-1] ** 2 + (1 - LAM) * dlv[-1] ** 2)
    rf_, vf_ = r * now_r / sr, dlv * now_v / sv
    pnl_fhs = _scen_pnl(legs, S, sigma, r_d, r_f, horizon_sums(rf_, horizon), horizon_sums(vf_, horizon), days, v0)

    # EWMA covariance of (r, dlv) at today, scaled to the horizon.
    X = np.c_[r, dlv]
    cov = np.cov(X[:30].T)
    for x in X:
        cov = LAM * cov + (1 - LAM) * np.outer(x, x)
    cov_h = cov * horizon
    rng = np.random.default_rng(seed)
    L = np.linalg.cholesky(cov_h + 1e-14 * np.eye(2))

    # Delta-gamma-vega Taylor with Cornish-Fisher (moments by simulation of normal factors).
    z = rng.standard_normal((n_mc, 2)) @ L.T
    dS = S * (np.exp(z[:, 0]) - 1)
    dsg = sigma * (np.exp(z[:, 1]) - 1)
    taylor = (g["delta"] * dS + 0.5 * g["gamma"] * dS ** 2 + g["vega"] * dsg
              + g["vanna"] * dS * dsg + 0.5 * g["volga"] * dsg ** 2 + g["theta"] * days)
    m, s = taylor.mean(), taylor.std()
    sk = float(((taylor - m) ** 3).mean() / s ** 3) if s > 0 else 0.0
    ku = float(((taylor - m) ** 4).mean() / s ** 4 - 3) if s > 0 else 0.0
    cf = {}
    for a in (0.99, 0.975):
        q = cornish_fisher(m, s, sk, ku, a)
        # ES under CF: average of CF quantiles deeper in the tail.
        tail = [cornish_fisher(m, s, sk, ku, 1 - (1 - a) * u) for u in np.linspace(0.005, 0.995, 200)]
        cf[f"var_{int(round(a * 1000))}"] = float(-q)
        cf[f"es_{int(round(a * 1000))}"] = float(-np.mean(tail))
    lin = g["delta"] * dS + g["vega"] * dsg + g["theta"] * days
    dn = {f"var_{int(round(a * 1000))}": float(-(lin.mean() + lin.std() * norm.ppf(1 - a))) for a in (0.99, 0.975)}

    # Monte Carlo, Student-t(4) factors with the same covariance, full revaluation.
    nu = 4
    t = rng.standard_t(nu, (n_mc, 2)) * np.sqrt((nu - 2) / nu)
    zt = t @ L.T
    pnl_mc = _scen_pnl(legs, S, sigma, r_d, r_f, zt[:, 0], zt[:, 1], days, v0)

    methods = {
        "HS": {**var_es(pnl_hs), "n": int(len(pnl_hs))},
        "FHS": {**var_es(pnl_fhs), "n": int(len(pnl_fhs))},
        "Delta-gamma CF": {**cf, "skew": sk, "excess_kurtosis": ku},
        "MC Student-t": {**var_es(pnl_mc), "n": n_mc},
        "Delta-normal": dn,
    }
    hist = np.histogram(pnl_fhs, bins=50)
    return {
        "value": v0, "greeks": g, "horizon_days": horizon, "methods": methods,
        "vol_now": {"spot_ann": float(now_r * np.sqrt(ppy)), "iv_dlog_ann": float(now_v * np.sqrt(ppy))},
        "correlation": float(cov[0, 1] / np.sqrt(cov[0, 0] * cov[1, 1])) if cov[0, 0] * cov[1, 1] > 0 else None,
        "distribution": {"centers": (0.5 * (hist[1][1:] + hist[1][:-1])).tolist(), "counts": hist[0].tolist(),
                         "method": "FHS"},
    }


def stressed_window(legs, S, sigma, r_d, r_f, fac, window=250, ppy=252):
    """250-day historical window that maximises the book's one-day ES 97.5 %."""
    r, dlv, dates = fac["r"], fac["dlv"], fac["dates"]
    v0 = float(book_value(legs, S, sigma, r_d, r_f))
    pnl = _scen_pnl(legs, S, sigma, r_d, r_f, r, dlv, 365 / ppy, v0)
    if len(pnl) < window + 5:
        return None, pnl
    best = None
    for start in range(0, len(pnl) - window + 1, 5):
        m = var_es(pnl[start:start + window])
        if best is None or m["es_975"] > best[1]["es_975"]:
            best = (start, m)
    s, m = best
    return {"start": dates[s], "end": dates[s + window - 1], **m,
            "worst_day": dates[s + int(np.argmin(pnl[s:s + window]))]}, pnl


def worst_days(legs, S, sigma, r_d, r_f, fac, pnl, n=8, ppy=252):
    g = book_greeks(legs, S, sigma, r_d, r_f)
    idx = np.argsort(pnl)[:n]
    out = []
    for i in idx:
        r, dl = fac["r"][i], fac["dlv"][i]
        dS, dsig = S * (np.exp(r) - 1), sigma * (np.exp(dl) - 1)
        out.append({"date": fac["dates"][i], "spot_move_pct": float((np.exp(r) - 1) * 100),
                    "vol_move_pts": float(dsig * 100), "pnl": float(pnl[i]),
                    "explain": pnl_explain(g, S, sigma, dS, dsig, 365 / ppy, float(pnl[i]))})
    return out


def backtest(legs, S, sigma, r_d, r_f, fac, pnl, window=250, a=0.99, ppy=252, max_days=500):
    """
    Rolling one-day FHS VaR(a) vs the static book's realised P&L over history.
    Each day's VaR uses only the preceding `window` days (no look-ahead).
    """
    r, dlv = fac["r"], fac["dlv"]
    n = len(r)
    start = max(window, n - max_days)
    if n - start < 50:
        return None
    v0 = float(book_value(legs, S, sigma, r_d, r_f))
    sr, sv = ewma_vol(r), ewma_vol(dlv)
    var_series, exc = [], []
    for t in range(start, n):
        rw, vw = r[t - window:t], dlv[t - window:t]
        k_r, k_v = sr[t] / sr[t - window:t], sv[t] / sv[t - window:t]
        p = _scen_pnl(legs, S, sigma, r_d, r_f, rw * k_r, vw * k_v, 365 / ppy, v0)
        q = -np.quantile(p, 1 - a)
        var_series.append(float(q))
        exc.append(bool(pnl[t] < -q))
    exc = np.array(exc)
    N, x = len(exc), int(exc.sum())
    p = 1 - a
    phat = x / N if N else 0
    def ll(pp, k, nn):
        pp = min(max(pp, 1e-12), 1 - 1e-12)
        return k * np.log(pp) + (nn - k) * np.log(1 - pp)
    lr_pof = -2 * (ll(p, x, N) - ll(phat, x, N))
    # Christoffersen independence: transition counts.
    e0, e1 = exc[:-1], exc[1:]
    n00, n01 = int(np.sum(~e0 & ~e1)), int(np.sum(~e0 & e1))
    n10, n11 = int(np.sum(e0 & ~e1)), int(np.sum(e0 & e1))
    p01 = n01 / max(n00 + n01, 1)
    p11 = n11 / max(n10 + n11, 1)
    p1 = (n01 + n11) / max(n00 + n01 + n10 + n11, 1)
    if n01 + n11 == 0:
        lr_ind = 0.0
    else:
        lr_ind = -2 * (ll(p1, n01 + n11, n00 + n01 + n10 + n11) - ll(p01, n01, n00 + n01) - ll(p11, n11, n10 + n11))
    last250 = int(exc[-250:].sum())
    zone = "green" if last250 <= 4 else "amber" if last250 <= 9 else "red"
    return {"dates": fac["dates"][start:], "pnl": pnl[start:].tolist(), "var": var_series,
            "exceptions": int(x), "n": N, "expected": float(p * N), "rate": float(phat),
            "kupiec_lr": float(lr_pof), "kupiec_p": float(1 - chi2.cdf(lr_pof, 1)),
            "christoffersen_lr": float(lr_ind), "christoffersen_p": float(1 - chi2.cdf(lr_ind, 1)),
            "exceptions_last_250": last250, "traffic_light": zone}


def ladder(legs, S, sigma, r_d, r_f, spot_pcts=None, vol_pts=None):
    """Full-revaluation P&L grid: spot moves (%) × absolute vol moves (vol points)."""
    sp = np.array(spot_pcts if spot_pcts is not None else [-20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20], float)
    vp = np.array(vol_pts if vol_pts is not None else [-10, -5, -2, 0, 2, 5, 10, 20], float)
    v0 = float(book_value(legs, S, sigma, r_d, r_f))
    grid = book_value(legs, S * (1 + sp[None, :] / 100), np.maximum(sigma + vp[:, None] / 100, VOL_FLOOR), r_d, r_f) - v0
    return {"spot_pct": sp.tolist(), "vol_pts": vp.tolist(), "pnl": grid.tolist()}
