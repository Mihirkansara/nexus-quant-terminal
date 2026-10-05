"""
xasset.py — Cross-asset correlation desk, gold/silver ratio analytics and
Margrabe outperformance options.

Correlations
  Daily returns on the common trading calendar (crypto closes are sampled on
  the same dates, so Fri→Mon crypto moves are aggregated). Yields enter as daily
  changes, everything else as log returns.
  • Rolling Pearson correlation over a window, and an EWMA (RiskMetrics λ = 0.94)
    correlation from the EWMA covariance recursion (J.P. Morgan 1996).
  • Correlation-break monitor: z-score of the current 30-day correlation of each
    pair against the distribution of its own rolling 30-day correlation.

Gold/silver ratio (GSR = XAU / XAG)
  • Level, z-scores and percentiles versus 1y/3y history.
  • Ornstein-Uhlenbeck fit of log GSR by AR(1) OLS: half-life = ln 2 / κ.
  • Engle-Granger (1987) cointegration of log XAU on log XAG: OLS residual tested
    with an ADF regression (constant, one lagged difference); 2-variable
    MacKinnon (2010) critical values −3.90 / −3.34 / −3.04 (1/5/10 %).
  • Dynamic hedge ratio by Kalman filter: log XAU_t = α_t + β_t·log XAG_t + v_t with
    random-walk (α, β); the standardised innovation e_t / √Q_t is the tradeable
    spread z-score (Chan 2013; QuantStart).
  • Ratio vol identity: σ_ratio² = σ_1² + σ_2² − 2ρσ_1σ_2.

Margrabe (1978) exchange / outperformance option
  Payoff max(n_1·S_1(T) − n_2·S_2(T), 0), assets paying continuous yields q_i
  (metal lease rates; ≈0 for crypto):
      σ = √(σ_1² + σ_2² − 2ρσ_1σ_2)
      d_1 = [ln(n_1 S_1 e^{−q_1 T} / (n_2 S_2 e^{−q_2 T})) + σ²T/2] / (σ√T),  d_2 = d_1 − σ√T
      V = n_1 S_1 e^{−q_1 T} N(d_1) − n_2 S_2 e^{−q_2 T} N(d_2)
  No domestic rate enters: asset 2 is the numeraire. With n_i = N / S_i(0) it is
  an at-the-money outperformance option on notional N (Derman 1992).

References:
    Margrabe, W. (1978). J. Finance, 33(1), 177–186.
    Derman, E. (1992). "Outperformance options." Goldman Sachs QS research notes.
    Engle, R. & Granger, C. (1987). Econometrica, 55(2), 251–276.
    MacKinnon, J. (2010). "Critical values for cointegration tests." QED WP 1227.
    Chan, E. (2013). Algorithmic Trading, ch. 3 (Kalman filter hedge ratio).
"""

import numpy as np
import pandas as pd
from scipy.stats import norm

ADF_CV_EG2 = {"1%": -3.90, "5%": -3.34, "10%": -3.04}
PAIRS_OF_INTEREST = [("XAUUSD", "XAGUSD"), ("BTCUSD", "XAUUSD"), ("BTCUSD", "ETHUSD"),
                     ("XAUUSD", "US10Y"), ("XAUUSD", "DXY"), ("BTCUSD", "US10Y"),
                     ("EURUSD", "XAUUSD"), ("XAUUSD", "WTI")]


# ─── returns & correlations ───────────────────────────────────────────────────

def returns_frame(closes: pd.DataFrame, yield_cols=("US10Y",)) -> pd.DataFrame:
    """Daily log returns (yield columns: changes in percentage points) on common dates."""
    px = closes.dropna(how="any")
    out = {}
    for col in px.columns:
        s = px[col].astype(float)
        out[col] = s.diff() if col in yield_cols else np.log(s).diff()
    return pd.DataFrame(out).dropna(how="any")


def ewma_corr(rets: pd.DataFrame, lam: float = 0.94) -> pd.DataFrame:
    x = rets.to_numpy()
    cov = np.cov(x[:30].T) if len(x) > 30 else np.cov(x.T)
    for row in x:
        cov = lam * cov + (1 - lam) * np.outer(row, row)
    sd = np.sqrt(np.diag(cov))
    return pd.DataFrame(cov / np.outer(sd, sd), index=rets.columns, columns=rets.columns)


def correlation_report(rets: pd.DataFrame, windows=(30, 90, 250), short=30, hist_days=500):
    cols = list(rets.columns)
    mats = {f"{w}d": rets.tail(w).corr().round(4).values.tolist() for w in windows if len(rets) >= w}
    mats["ewma"] = ewma_corr(rets).round(4).values.tolist()
    rolling, breaks = {}, []
    tail = rets.tail(hist_days + short)
    for a, b in PAIRS_OF_INTEREST:
        if a not in cols or b not in cols:
            continue
        rc = tail[a].rolling(short).corr(tail[b]).dropna()
        r90 = tail[a].rolling(90).corr(tail[b]).dropna()
        key = f"{a}/{b}"
        rolling[key] = {"dates": [d.strftime("%Y-%m-%d") for d in rc.index],
                        f"corr_{short}d": rc.round(4).tolist(),
                        "corr_90d": r90.reindex(rc.index).round(4).tolist()}
        now, mu, sd = float(rc.iloc[-1]), float(rc.mean()), float(rc.std())
        z = (now - mu) / sd if sd > 0 else 0.0
        breaks.append({"pair": key, "corr_now": now, "corr_90d": float(r90.iloc[-1]),
                       "mean": mu, "z": z, "percentile": float((rc < now).mean() * 100),
                       "flag": "BREAK" if abs(z) >= 2 else "WATCH" if abs(z) >= 1.5 else ""})
    vols = {c: float(rets[c].tail(63).std() * np.sqrt(252)) for c in cols}
    return {"assets": cols, "matrices": mats, "rolling": rolling,
            "breaks": sorted(breaks, key=lambda r: -abs(r["z"])), "vol_3m": vols,
            "n_obs": int(len(rets)), "last_date": rets.index[-1].strftime("%Y-%m-%d")}


# ─── gold/silver ratio ────────────────────────────────────────────────────────

def ou_fit(x: np.ndarray, ppy: int = 252) -> dict:
    """AR(1) OLS on a level series → OU κ (per year), long-run mean, half-life (days)."""
    x = np.asarray(x, dtype=float)
    X = np.column_stack([np.ones(len(x) - 1), x[:-1]])
    (a, b), *_ = np.linalg.lstsq(X, x[1:], rcond=None)
    b = float(np.clip(b, 1e-6, 0.999999))
    kappa = -np.log(b) * ppy
    return {"kappa": float(kappa), "mean": float(a / (1 - b)),
            "half_life_days": float(np.log(2) / kappa * ppy)}


def adf_stat(e: np.ndarray, lags: int = 1) -> float:
    """t-statistic of γ in Δe_t = c + γ e_{t−1} + Σ φ_i Δe_{t−i} + ε."""
    e = np.asarray(e, dtype=float)
    de = np.diff(e)
    y = de[lags:]
    cols = [np.ones(len(y)), e[lags:-1]] + [de[lags - i:-i] for i in range(1, lags + 1)]
    X = np.column_stack(cols)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    s2 = resid @ resid / (len(y) - X.shape[1])
    se = np.sqrt(s2 * np.linalg.inv(X.T @ X)[1, 1])
    return float(beta[1] / se)


def engle_granger(y: np.ndarray, x: np.ndarray) -> dict:
    X = np.column_stack([np.ones(len(x)), x])
    (a, b), *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - a - b * x
    stat = adf_stat(resid)
    return {"alpha": float(a), "beta": float(b), "adf_stat": stat, "critical": ADF_CV_EG2,
            "cointegrated_5pct": bool(stat < ADF_CV_EG2["5%"])}


def kalman_hedge(y: np.ndarray, x: np.ndarray, delta: float = 1e-2, ve: float | None = None,
                 calib: int = 120):
    """Random-walk (α, β) Kalman filter for y = α + βx + v. Returns α, β, innovation z.
    The observation noise ve defaults to the OLS residual variance over the first
    `calib` points, so the innovation z-scores are on a unit scale."""
    n = len(y)
    m = min(n, calib)
    x_bar = float(np.mean(x[:m]))
    xc = np.asarray(x, dtype=float) - x_bar          # centring decouples α from β
    if ve is None:
        X = np.column_stack([np.ones(m), xc[:m]])
        coef, *_ = np.linalg.lstsq(X, y[:m], rcond=None)
        ve = float(np.var(y[:m] - X @ coef)) or 1e-8
    # State noise relative to observation noise: delta sets how fast (α, β) may drift.
    Vw = delta / (1 - delta) * ve * np.diag([1.0, 1.0 / max(float(np.var(xc[:m])), 1e-12)])
    theta = np.zeros(2)
    R = np.zeros((2, 2))
    P = None
    alpha, beta, zs = np.empty(n), np.empty(n), np.empty(n)
    for t in range(n):
        F = np.array([1.0, xc[t]])
        R = (P + Vw) if P is not None else R
        yhat = F @ theta
        Q = F @ R @ F + ve
        e = y[t] - yhat
        K = R @ F / Q
        theta = theta + K * e
        P = R - np.outer(K, F) @ R
        alpha[t], beta[t], zs[t] = theta[0], theta[1], e / np.sqrt(Q)
    return alpha - beta * x_bar, beta, zs              # α back on the uncentred scale


def gsr_report(xau: pd.Series, xag: pd.Series, burn_in: int = 60) -> dict:
    df = pd.concat([xau, xag], axis=1, keys=["xau", "xag"]).dropna()
    gsr = df["xau"] / df["xag"]
    lg = np.log(gsr.to_numpy())
    y, x = np.log(df["xau"].to_numpy()), np.log(df["xag"].to_numpy())

    def window_stats(n):
        w = gsr.tail(n)
        return {"mean": float(w.mean()), "sd": float(w.std()),
                "z": float((gsr.iloc[-1] - w.mean()) / w.std()) if w.std() > 0 else 0.0,
                "percentile": float((w < gsr.iloc[-1]).mean() * 100),
                "min": float(w.min()), "max": float(w.max())}

    ou = ou_fit(lg[-min(len(lg), 750):])
    eg = engle_granger(y[-min(len(y), 750):], x[-min(len(x), 750):])
    a_k, b_k, z_k = kalman_hedge(y, x)
    r = np.diff(lg)
    tail = gsr.tail(500)
    dates = [d.strftime("%Y-%m-%d") for d in tail.index]
    m1y = gsr.rolling(252, min_periods=60).mean().reindex(tail.index)
    s1y = gsr.rolling(252, min_periods=60).std().reindex(tail.index)
    k = len(tail)
    return {
        "current": float(gsr.iloc[-1]),
        "xau": float(df["xau"].iloc[-1]), "xag": float(df["xag"].iloc[-1]),
        "stats_1y": window_stats(252), "stats_3y": window_stats(min(len(gsr), 756)),
        "ou": {**ou, "mean_level": float(np.exp(ou["mean"]))},
        "engle_granger": eg,
        "kalman": {"beta_now": float(b_k[-1]), "alpha_now": float(a_k[-1]),
                   "z_now": float(z_k[-1]),
                   "beta": b_k[-k:].round(5).tolist(), "z": z_k[-k:].round(4).tolist(),
                   "valid_from": max(0, burn_in - (len(gsr) - k))},
        "ratio_vol_3m": float(np.std(r[-63:]) * np.sqrt(252)),
        "series": {"dates": dates, "gsr": tail.round(4).tolist(),
                   "mean_1y": m1y.round(4).tolist(), "upper_1y": (m1y + 2 * s1y).round(4).tolist(),
                   "lower_1y": (m1y - 2 * s1y).round(4).tolist()},
    }


# ─── Margrabe outperformance option ───────────────────────────────────────────

def margrabe(S1, S2, n1, n2, sigma1, sigma2, rho, T, q1=0.0, q2=0.0):
    """Price and Greeks of max(n1·S1(T) − n2·S2(T), 0)."""
    sig = float(np.sqrt(max(sigma1 ** 2 + sigma2 ** 2 - 2 * rho * sigma1 * sigma2, 1e-12)))
    F1 = n1 * S1 * np.exp(-q1 * T)
    F2 = n2 * S2 * np.exp(-q2 * T)
    sq = sig * np.sqrt(T)
    d1 = (np.log(F1 / F2) + 0.5 * sq ** 2) / sq
    d2 = d1 - sq
    price = F1 * norm.cdf(d1) - F2 * norm.cdf(d2)
    vega = F1 * norm.pdf(d1) * np.sqrt(T)              # ∂V/∂σ (ratio vol)
    return {
        "price": float(price), "ratio_vol": sig, "d1": float(d1), "d2": float(d2),
        "delta_1": float(n1 * np.exp(-q1 * T) * norm.cdf(d1)),       # ∂V/∂S1
        "delta_2": float(-n2 * np.exp(-q2 * T) * norm.cdf(d2)),      # ∂V/∂S2
        "vega_ratio": float(vega),
        "vega_1": float(vega * (sigma1 - rho * sigma2) / sig),       # ∂V/∂σ1
        "vega_2": float(vega * (sigma2 - rho * sigma1) / sig),       # ∂V/∂σ2
        "corr_sens": float(-vega * sigma1 * sigma2 / sig),           # ∂V/∂ρ
        "prob_exercise": float(norm.cdf(d2)),
    }


def margrabe_mc(S1, S2, n1, n2, sigma1, sigma2, rho, T, q1=0.0, q2=0.0, n=200_000, seed=1):
    """Monte Carlo check under the asset-2 measure-free formulation (r cancels)."""
    rng = np.random.default_rng(seed)
    z1 = rng.standard_normal(n)
    z2 = rho * z1 + np.sqrt(1 - rho ** 2) * rng.standard_normal(n)
    r = 0.03                                            # any r: it cancels exactly
    s1 = S1 * np.exp((r - q1 - 0.5 * sigma1 ** 2) * T + sigma1 * np.sqrt(T) * z1)
    s2 = S2 * np.exp((r - q2 - 0.5 * sigma2 ** 2) * T + sigma2 * np.sqrt(T) * z2)
    pay = np.exp(-r * T) * np.maximum(n1 * s1 - n2 * s2, 0)
    return float(pay.mean()), float(pay.std() / np.sqrt(n))
