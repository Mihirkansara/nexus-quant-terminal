"""
vol_forecast.py — Volatility forecasting & regime engine for volatile assets.

Forecasts the average variance over the next h days (1D, 1W, 1M) with four
models, scores them on a rolling out-of-sample backtest and blends them:

  1. HAR-RV (Corsi 2009): heterogeneous autoregression of log realised variance
         log RV(t+1..t+h) = b0 + b_d·log RV_d + b_w·log RV_w + b_m·log RV_m [+ b_we·weekend]
     with a weekend dummy for 24/7 crypto (intraweek seasonality, cf. Brauneis et al.).
  2. GJR-GARCH(1,1) (Glosten, Jagannathan & Runkle 1993), Gaussian QMLE:
         σ²_t = ω + (α + γ·1[r_{t−1}<0])·r²_{t−1} + β·σ²_{t−1}
     with the closed-form multi-step variance term structure.
  3. Gradient boosting (scikit-learn HistGradientBoostingRegressor) on HAR features
     plus returns, ranges and calendar features — the ML benchmark of the
     recent realised-vol literature.
  4. EWMA RiskMetrics (λ = 0.94) — naive benchmark.

  Daily variance proxy: Garman-Klass (1980) range estimator plus the squared
  overnight gap, falling back to squared close-to-close returns without OHLC.
  Discretely sampled highs/lows bias range estimators down, so the proxy is
  rescaled to the mean squared close-to-close return (Hansen & Lunde 2005 style)
  — forecasts are then on the same scale as close-to-close and implied vol.

  Evaluation: QLIKE and MSE are the loss functions whose rankings are robust to
  noise in the variance proxy (Patton 2011):
         QLIKE(y, f) = y/f − ln(y/f) − 1
  The ensemble weights each model by inverse out-of-sample QLIKE.

  Regimes: 2-state Gaussian hidden Markov model on daily returns (Hamilton 1989),
  fitted by Baum-Welch EM with scaled forward-backward recursions.

References:
    Corsi, F. (2009). J. Financial Econometrics, 7(2), 174–196.
    Glosten, L., Jagannathan, R. & Runkle, D. (1993). J. Finance, 48(5), 1779–1801.
    Garman, M. & Klass, M. (1980). J. Business, 53(1), 67–78.
    Patton, A. (2011). J. Econometrics, 160(1), 246–256.
    Hamilton, J. (1989). Econometrica, 57(2), 357–384.
    Brauneis, A., Mestel, R. et al. (2024). Crypto volatility forecasting.
"""

import warnings

import numpy as np
from scipy.optimize import minimize
from scipy.signal import lfilter

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
    SKLEARN_AVAILABLE = True
except ImportError:          # the engine still runs with the econometric models
    SKLEARN_AVAILABLE = False

MODELS = ["HAR-RV", "GJR-GARCH", "Gradient Boosting", "EWMA"]


# ─── variance proxy & features ────────────────────────────────────────────────

def daily_variance(o, h, l, c, calib_end=None):
    """Garman-Klass daily variance + squared overnight gap (fallback: r²), scaled so
    its mean matches the mean squared close-to-close return over [0, calib_end)."""
    c = np.asarray(c, dtype=float)
    r = np.diff(np.log(c))
    if o is None or h is None or l is None:
        return np.maximum(r ** 2, 1e-12), r
    o, h, l = (np.asarray(x, dtype=float)[1:] for x in (o, h, l))
    cc = c[1:]
    gk = 0.5 * np.log(h / l) ** 2 - (2 * np.log(2) - 1) * np.log(cc / o) ** 2
    gap = np.log(o / c[:-1]) ** 2
    v = np.maximum(gk, 0) + gap
    bad = ~np.isfinite(v) | (v <= 0)
    v[bad] = r[bad] ** 2
    k = slice(0, calib_end)                     # calibrate on in-sample data only
    v *= np.mean(r[k] ** 2) / np.mean(v[k])     # scale to close-to-close variance
    return np.maximum(v, 1e-12), r


def _rolling_mean(x, w):
    cs = np.concatenate([[0.0], np.cumsum(x)])
    out = np.full(len(x), np.nan)
    out[w - 1:] = (cs[w:] - cs[:-w]) / w
    return out


def _forward_mean(x, h):
    """Mean of x[t+1 .. t+h] aligned at t (NaN where unavailable)."""
    cs = np.concatenate([[0.0], np.cumsum(x)])
    out = np.full(len(x), np.nan)
    n = len(x)
    idx = np.arange(n - h)
    out[idx] = (cs[idx + 1 + h] - cs[idx + 1]) / h
    return out


def build_features(v, r, ppy, weekday=None):
    """HAR + ML feature matrix aligned at each day t (information up to t)."""
    w_w = max(2, round(7 * ppy / 365))
    w_m = max(5, round(30 * ppy / 365))
    lv = np.log(v)
    rv_w, rv_m = _rolling_mean(v, w_w), _rolling_mean(v, w_m)
    har = np.column_stack([lv, np.log(rv_w), np.log(rv_m)])
    extra = np.column_stack([
        r, np.abs(r), np.minimum(r, 0) ** 2 / v.mean(),
        np.log(rv_w) - np.log(rv_m),
        _rolling_mean(r, w_m) * np.sqrt(w_m) / np.sqrt(np.maximum(rv_m, 1e-12)),
    ])
    cal = None
    if weekday is not None:
        nxt = (np.asarray(weekday) + 1) % 7            # weekday of t+1
        cal = (nxt >= 5).astype(float)[:, None]          # next day is Sat/Sun
    return har, extra, cal, w_w, w_m


# ─── models ───────────────────────────────────────────────────────────────────

def _ols(X, y):
    X1 = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
    resid = y - X1 @ beta
    return beta, float(np.var(resid))


class HAR:
    def __init__(self, use_weekend):
        self.use_weekend = use_weekend

    def _X(self, har, cal, h):
        if self.use_weekend and cal is not None and h == 1:
            return np.column_stack([har, cal])
        return har

    def fit(self, har, cal, y, h):
        self.h = h
        self.beta, self.s2 = _ols(self._X(har, cal, h), np.log(y))
        return self

    def predict(self, har, cal):
        X = self._X(har, cal, self.h)
        # log-normal bias correction: E[RV] = exp(μ + s²/2)
        return np.exp(self.beta[0] + X @ self.beta[1:] + 0.5 * self.s2)


class GBM:
    def fit(self, X, y):
        self.m = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.05, max_depth=3,
                                               min_samples_leaf=25, l2_regularization=1.0,
                                               random_state=0)
        ly = np.log(y)
        self.m.fit(X, ly)
        self.s2 = float(np.var(ly - self.m.predict(X)))
        return self

    def predict(self, X):
        return np.exp(self.m.predict(X) + 0.5 * self.s2)


def _gjr_filter(params, r, var0):
    """σ²[0] = var0, σ²[t+1] = ω + (α + γ·1[r_t<0])·r_t² + β·σ²[t]  (vectorised AR(1) filter)."""
    omega, alpha, gamma, beta = params
    r = np.asarray(r, dtype=float)
    x = omega + (alpha + gamma * (r < 0)) * r ** 2
    tail = lfilter([1.0], [1.0, -beta], x, zi=[beta * var0])[0] if len(r) else np.array([])
    return np.concatenate([[var0], tail])


def fit_gjr_garch(r):
    """Gaussian QMLE of GJR-GARCH(1,1) on demeaned returns. Returns params + filtered σ²."""
    r = np.asarray(r, dtype=float) - np.mean(r)
    var0 = float(np.var(r))

    def unpack(x):
        # positivity + stationarity via smooth transforms
        a, g, b = np.exp(x[1:4])
        tot = a + 0.5 * g + b
        scale = 0.999 / tot if tot >= 0.999 else 1.0
        a, g, b = a * scale, g * scale, b * scale
        omega = var0 * (1 - a - 0.5 * g - b) * np.exp(x[0])
        return omega, a, g, b

    def nll(x):
        p = unpack(x)
        s2 = _gjr_filter(p, r, var0)[:-1]
        s2 = np.maximum(s2, 1e-14)
        return 0.5 * np.sum(np.log(s2) + r ** 2 / s2)

    best = None
    for x0 in ([0.0, np.log(0.05), np.log(0.05), np.log(0.85)],
               [0.0, np.log(0.10), np.log(0.01), np.log(0.80)]):
        res = minimize(nll, x0, method="L-BFGS-B")
        if best is None or res.fun < best.fun:
            best = res
    params = unpack(best.x)
    return params, _gjr_filter(params, r, var0), var0


def gjr_avg_variance(params, s2_next, h):
    """Average conditional variance over the next h days (closed form)."""
    omega, a, g, b = params
    persist = a + 0.5 * g + b
    vl = omega / max(1 - persist, 1e-9)
    k = np.arange(h)
    return float(np.mean(vl + persist ** k * (s2_next - vl)))


# ─── 2-state Gaussian HMM ─────────────────────────────────────────────────────

def fit_hmm(r, n_iter=200, tol=1e-7):
    """Baum-Welch EM for a 2-state Gaussian HMM. State 1 = high-vol regime."""
    x = np.asarray(r, dtype=float)
    n = len(x)
    q = np.quantile(np.abs(x), 0.75)
    calm = np.abs(x) <= q
    mu = np.array([x[calm].mean(), x[~calm].mean()])
    sd = np.array([x[calm].std() + 1e-9, x[~calm].std() + 1e-9])
    A = np.array([[0.97, 0.03], [0.06, 0.94]])
    pi = np.array([0.7, 0.3])
    ll_old = -np.inf
    for _ in range(n_iter):
        B = np.exp(-0.5 * ((x[:, None] - mu) / sd) ** 2) / (sd * np.sqrt(2 * np.pi)) + 1e-300
        alpha = np.empty((n, 2)); c = np.empty(n)
        alpha[0] = pi * B[0]; c[0] = alpha[0].sum(); alpha[0] /= c[0]
        for t in range(1, n):
            alpha[t] = (alpha[t - 1] @ A) * B[t]
            c[t] = alpha[t].sum(); alpha[t] /= c[t]
        beta = np.ones((n, 2))
        for t in range(n - 2, -1, -1):
            beta[t] = (A @ (B[t + 1] * beta[t + 1])) / c[t + 1]
        gamma = alpha * beta
        gamma /= gamma.sum(axis=1, keepdims=True)
        xi = (alpha[:-1, :, None] * A[None] * (B[1:] * beta[1:])[:, None, :]) / c[1:, None, None]
        pi = gamma[0]
        A = xi.sum(0) / gamma[:-1].sum(0)[:, None]
        A /= A.sum(1, keepdims=True)
        w = gamma.sum(0)
        mu = (gamma * x[:, None]).sum(0) / w
        sd = np.sqrt((gamma * (x[:, None] - mu) ** 2).sum(0) / w) + 1e-9
        ll = float(np.log(c).sum())
        if abs(ll - ll_old) < tol * abs(ll):
            break
        ll_old = ll
    if sd[0] > sd[1]:                         # order states: 0 = calm, 1 = turbulent
        order = [1, 0]
        mu, sd, A = mu[order], sd[order], A[np.ix_(order, order)]
        alpha, gamma = alpha[:, order], gamma[:, order]
    return {"mu": mu, "sd": sd, "A": A, "filtered": alpha, "smoothed": gamma, "loglik": ll}


# ─── backtest & report ────────────────────────────────────────────────────────

def qlike(y, f):
    ratio = np.asarray(y) / np.asarray(f)
    return float(np.mean(ratio - np.log(ratio) - 1))


def ewma_series(r, lam=0.94):
    """EWMA variance after observing r[0..t], for every t (RiskMetrics)."""
    r = np.asarray(r, dtype=float)
    s0 = float(np.var(r[:30])) if len(r) >= 30 else float(np.var(r))
    return lfilter([1 - lam], [1.0, -lam], r ** 2, zi=[lam * s0])[0]


def _garch_state(r, last, cache):
    """GJR-GARCH fitted on r[..last], filter rolled forward without re-estimation, so
    s2_full[t+1] uses returns up to t only. Cached: one fit serves every horizon."""
    if last not in cache:
        params, s2, _ = fit_gjr_garch(r[: last + 1])
        rr = r - np.mean(r[: last + 1])
        s2_full = np.empty(len(r) + 1)
        s2_full[: last + 2] = s2
        s2_full[last + 1:] = _gjr_filter(params, rr[last + 1:], s2[-1])
        cache[last] = (params, s2_full)
    return cache[last]


def _model_forecasts(fit_idx, pred_idx, h, v, r, har, X_ml, cal, use_weekend,
                     ewma, garch_cache, garch_last):
    """Fit every model on targets known at fit_idx; forecast at pred_idx."""
    y = _forward_mean(v, h)
    train = fit_idx[np.isfinite(y[fit_idx]) & np.all(np.isfinite(X_ml[fit_idx]), axis=1)]
    out = {}
    har_m = HAR(use_weekend).fit(har[train], None if cal is None else cal[train], y[train], h)
    out["HAR-RV"] = har_m.predict(har[pred_idx], None if cal is None else cal[pred_idx])
    if SKLEARN_AVAILABLE:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            out["Gradient Boosting"] = GBM().fit(X_ml[train], y[train]).predict(X_ml[pred_idx])
    params, s2_full = _garch_state(r, garch_last, garch_cache)
    out["GJR-GARCH"] = np.array([gjr_avg_variance(params, s2_full[t + 1], h) for t in pred_idx])
    out["EWMA"] = ewma[pred_idx]
    return out, params


def forecast_report(o, h, l, c, dates=None, ppy=252, n_test=250, refit_every=21,
                    implied=None):
    """
    Full report: current forecasts per model and horizon, out-of-sample scores,
    ensemble, backtest series, HMM regime and (optionally) comparison to implied vols.
    implied: {"1W": σ, "1M": σ} annualised implied vols (e.g. Deribit ATM).
    """
    n_ret = len(c) - 1
    w_m_est = max(5, round(30 * ppy / 365))
    n_test_est = int(min(n_test, max(60, n_ret - (w_m_est + 5) - 250)))
    # Calibrate the proxy scale on data before the first backtest origin (no look-ahead).
    v, r = daily_variance(o, h, l, c, calib_end=n_ret - w_m_est - n_test_est)
    weekday = None
    if dates is not None and ppy == 365:
        weekday = np.array([d.weekday() for d in dates[1:]])
    har, extra, cal, w_w, w_m = build_features(v, r, ppy, weekday)
    X_ml = np.column_stack([har, extra] + ([cal] if cal is not None else []))
    n = len(v)
    first_valid = w_m + 5
    horizons = [("1D", 1), ("1W", w_w), ("1M", w_m)]
    n_test = int(min(n_test, max(60, n - first_valid - 250)))
    if n - first_valid < 300:
        raise ValueError("need at least ~300 days of history for a fair backtest")
    use_weekend = cal is not None

    ewma = ewma_series(r)
    garch_cache = {}
    max_h = w_m
    start = n - max_h - n_test               # common origins for every horizon
    scores, backtest, current = {}, {}, {}
    for label, hz in horizons:
        y = _forward_mean(v, hz)
        preds = {m: [] for m in MODELS if m != "Gradient Boosting" or SKLEARN_AVAILABLE}
        origins = []
        for blk in range(start, n - max_h, refit_every):
            pred_idx = np.arange(blk, min(blk + refit_every, n - max_h))
            # Only targets fully realised by the block start may be used for fitting;
            # GARCH (no target) is estimated on returns up to the block start.
            fit_idx = np.arange(first_valid, blk - hz + 1)
            f, _ = _model_forecasts(fit_idx, pred_idx, hz, v, r, har, X_ml, cal, use_weekend,
                                    ewma, garch_cache, blk)
            for m in preds:
                preds[m].extend(f[m])
            origins.extend(pred_idx)
        origins = np.array(origins)
        realised = y[origins]
        model_scores = {m: {"qlike": qlike(realised, np.array(p)),
                            "rmse_vol": float(np.sqrt(np.mean((np.sqrt(np.array(p) * ppy)
                                                               - np.sqrt(realised * ppy)) ** 2))),
                            "bias_vol": float(np.mean(np.sqrt(np.array(p) * ppy)
                                                      - np.sqrt(realised * ppy)))}
                        for m, p in preds.items()}
        inv = {m: 1 / s["qlike"] for m, s in model_scores.items() if m != "EWMA"}
        tot = sum(inv.values())
        weights = {m: w / tot for m, w in inv.items()}
        ens = sum(weights[m] * np.array(preds[m]) for m in weights)
        model_scores["Ensemble"] = {
            "qlike": qlike(realised, ens),
            "rmse_vol": float(np.sqrt(np.mean((np.sqrt(ens * ppy) - np.sqrt(realised * ppy)) ** 2))),
            "bias_vol": float(np.mean(np.sqrt(ens * ppy) - np.sqrt(realised * ppy))),
        }
        ewma_q = model_scores["EWMA"]["qlike"]
        for s in model_scores.values():
            s["qlike_vs_ewma_pct"] = (1 - s["qlike"] / ewma_q) * 100
        scores[label] = {"days": hz, "weights": weights, "models": model_scores,
                         "n_forecasts": int(len(origins))}

        # Current forecast: fit on everything realised so far, predict from today.
        fit_idx = np.arange(first_valid, n - hz)
        f, gparams = _model_forecasts(fit_idx, np.array([n - 1]), hz, v, r, har, X_ml, cal,
                                      use_weekend, ewma, garch_cache, n - 1)
        cur = {m: float(np.sqrt(f[m][0] * ppy)) for m in f}
        cur["Ensemble"] = float(np.sqrt(sum(weights[m] * f[m][0] for m in weights) * ppy))
        current[label] = cur

        if label == "1M":
            backtest = {
                "origin_index": origins.tolist(),
                "dates": [str(dates[1:][i])[:10] for i in origins] if dates is not None else None,
                "realised": np.sqrt(realised * ppy).tolist(),
                "forecasts": {m: np.sqrt(np.array(p) * ppy).tolist() for m, p in preds.items()},
                "ensemble": np.sqrt(ens * ppy).tolist(),
            }
            garch = dict(zip(["omega", "alpha", "gamma", "beta"], map(float, gparams)))
            garch["persistence"] = garch["alpha"] + 0.5 * garch["gamma"] + garch["beta"]
            garch["long_run_vol"] = float(np.sqrt(garch["omega"] / max(1 - garch["persistence"], 1e-9) * ppy))
            garch["half_life_days"] = float(np.log(0.5) / np.log(garch["persistence"])) \
                if 0 < garch["persistence"] < 1 else None

    hmm = fit_hmm(r[-min(len(r), 1000):])
    A = hmm["A"]
    p_now = hmm["filtered"][-1]
    p_next = p_now @ A
    regime = {
        "state_vol": (hmm["sd"] * np.sqrt(ppy)).tolist(),
        "state_mean_ann": (hmm["mu"] * ppy).tolist(),
        "transition": A.tolist(),
        "expected_duration_days": (1 / np.maximum(1 - np.diag(A), 1e-9)).tolist(),
        "p_turbulent_now": float(p_now[1]),
        "p_turbulent_next": float(p_next[1]),
        "current": "TURBULENT" if p_now[1] > 0.5 else "CALM",
        "history_p_turbulent": hmm["smoothed"][-min(365, len(r)):, 1].tolist(),
        "history_dates": [str(x)[:10] for x in dates[1:][-min(365, len(r)):]] if dates is not None else None,
    }

    signals = {}
    if implied:
        for label in ("1W", "1M"):
            iv = implied.get(label)
            if iv:
                fc = current[label]["Ensemble"]
                spread = iv - fc
                signals[label] = {
                    "implied": iv, "forecast": fc, "spread": spread,
                    "ratio": iv / fc,
                    "view": "IMPLIED RICH" if spread > 0.1 * fc else
                            "IMPLIED CHEAP" if spread < -0.1 * fc else "FAIR",
                }

    rv_now = {lbl: float(np.sqrt(np.nanmean(v[-hz:]) * ppy)) for lbl, hz in horizons}
    return _clean({
        "periods_per_year": ppy,
        "n_obs": int(n),
        "horizons": {lbl: hz for lbl, hz in horizons},
        "ml_available": SKLEARN_AVAILABLE,
        "realised_now": rv_now,
        "current": current,
        "scores": scores,
        "backtest": backtest,
        "garch": garch,
        "regime": regime,
        "implied_signals": signals,
    })


def _clean(obj, nd=6):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, nd) if np.isfinite(x) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: _clean(v, nd) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v, nd) for v in obj]
    return obj
