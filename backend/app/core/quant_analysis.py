"""
quant_analysis.py — Quantitative signals for forex pairs.

Core analytics powered by:
  • gs-quant (Goldman Sachs, 2024) — volatility, RSI, MACD, Bollinger Bands,
    max drawdown, z-scores, rolling statistics
  • Custom implementations for models not in gs-quant:
      1. EWMA Vol Forecast     — RiskMetrics λ=0.94 (JP Morgan, 1994)
      2. VaR / CVaR            — Parametric Normal + Historical ES (Basel III)
      3. Hurst Exponent        — Variance-scaling (Hurst 1951)
      4. Ornstein-Uhlenbeck    — OLS AR(1) (Uhlenbeck & Ornstein 1930)
      5. Carry Signal          — Uncovered Interest Parity (Fama 1984)
      6. Momentum              — Price momentum (Jegadeesh & Titman 1993)
"""

import numpy as np
import pandas as pd
from scipy import stats

# GS-Quant timeseries — all work offline, no credentials required
from gs_quant.timeseries import econometrics as gseco
from gs_quant.timeseries import statistics  as gsstat
from gs_quant.timeseries import technicals  as gstech


# ─── helpers ──────────────────────────────────────────────────────────────────

def _to_series(prices) -> pd.Series:
    arr = np.array(prices, dtype=float)
    idx = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(arr), freq='D')
    return pd.Series(arr, index=idx)


def _safe_last(series: pd.Series, default=0.0) -> float:
    try:
        v = series.dropna()
        return float(v.iloc[-1]) if len(v) else default
    except Exception:
        return default


def _hurst_exponent(prices: np.ndarray) -> float:
    """Variance-scaling H estimator: Var[ΔX_τ] ~ τ^(2H). (Hurst 1951)"""
    prices = np.array(prices, dtype=float)
    max_lag = min(len(prices) // 3, 30)
    if max_lag < 3:
        return 0.5
    lags = range(2, max_lag)
    variances = [np.var(np.diff(prices, n=lag)) for lag in lags]
    try:
        slope, *_ = stats.linregress(np.log(list(lags)), np.log(variances))
        return float(np.clip(slope / 2, 0.01, 0.99))
    except Exception:
        return 0.5


def _estimate_ou_params(prices: np.ndarray) -> dict:
    """OLS AR(1) → OU parameters. (Uhlenbeck & Ornstein 1930)"""
    X = np.array(prices, dtype=float)
    Xl, Xc = X[:-1], X[1:]
    n = len(Xl)
    b_num = n * np.dot(Xl, Xc) - Xl.sum() * Xc.sum()
    b_den = n * np.dot(Xl, Xl) - Xl.sum() ** 2
    b = float(np.clip(b_num / b_den if b_den else 0.999, 0.001, 0.9999))
    a = float(Xc.mean() - b * Xl.mean())
    resid_sigma = float(np.std(Xc - (a + b * Xl)) * np.sqrt(252))
    kappa     = float(-np.log(b) * 252)
    theta     = float(a / (1 - b))
    half_life = float(np.log(2) / max(kappa, 1e-6) / 252 * 365)
    return {"kappa": round(kappa, 4), "theta": round(theta, 6),
            "sigma": round(resid_sigma, 6), "half_life_days": round(half_life, 1)}


# ─── main signal engine ───────────────────────────────────────────────────────

def compute_signals(prices: list, r_d: float = 0.05, r_f: float = 0.04) -> dict:
    """
    Full quant signal suite — core analytics via gs-quant (Goldman Sachs),
    extended with OU, Hurst, VaR and carry trade signals.
    """
    px_raw = np.array(prices, dtype=float)
    n = len(px_raw)
    if n < 10:
        return {"error": "Need ≥10 observations."}

    px  = _to_series(px_raw)
    w20 = min(20, n)
    w60 = min(60, n)
    rets_raw = np.diff(np.log(px_raw))

    # ── 1. Volatility  (gs-quant econometrics.volatility) ────────────────────
    # GS implementation: annualized realized vol over rolling window
    hv20_s = gseco.volatility(px, w20)
    hv60_s = gseco.volatility(px, w60)
    hv20   = _safe_last(hv20_s, np.std(rets_raw[-w20:]) * np.sqrt(252))
    hv60   = _safe_last(hv60_s, np.std(rets_raw[-w60:]) * np.sqrt(252))
    vol_regime = ("HIGH"   if hv20 > hv60 * 1.25 else
                  "LOW"    if hv20 < hv60 * 0.80 else "NORMAL")

    # EWMA forecast (RiskMetrics λ=0.94, JP Morgan 1994)
    lam, ewma_var = 0.94, float(np.var(rets_raw[-w20:]))
    for r in rets_raw[-w20:]:
        ewma_var = lam * ewma_var + (1 - lam) * r ** 2
    ewma_vol = float(np.sqrt(ewma_var * 252))

    # GS max-drawdown (institutional risk metric)
    dd_s    = gseco.max_drawdown(px, w60)
    max_dd  = _safe_last(dd_s, -0.01)

    # ── 2. VaR / CVaR  (custom — Parametric Normal + Basel III) ─────────────
    mu_d, sig_d = float(np.mean(rets_raw[-w20:])), float(np.std(rets_raw[-w20:]))
    var95 = float(-(mu_d + sig_d * stats.norm.ppf(0.05)))
    var99 = float(-(mu_d + sig_d * stats.norm.ppf(0.01)))
    tail  = np.sort(rets_raw[-w60:])[:max(1, int(0.05 * w60))]
    cvar95 = float(-np.mean(tail))

    # ── 3. Hurst Exponent  (custom — Hurst 1951) ─────────────────────────────
    hurst = _hurst_exponent(px_raw[-w60:])
    hurst_regime = ("MEAN-REVERTING" if hurst < 0.45 else
                    "TRENDING"       if hurst > 0.55 else "RANDOM WALK")
    hurst_action = {"MEAN-REVERTING": "FADE extreme moves — OU strategies apply",
                    "TRENDING":       "FOLLOW momentum — trend-following applies",
                    "RANDOM WALK":    "No structural edge — vol strategies apply"}[hurst_regime]

    # ── 4. Ornstein-Uhlenbeck  (custom — Uhlenbeck & Ornstein 1930) ──────────
    ou      = _estimate_ou_params(px_raw[-w60:])
    ou_std  = ou["sigma"] / np.sqrt(max(ou["kappa"], 0.01) * 252)

    # Z-score via gs-quant statistics (institutional grade)
    z_s     = gsstat.zscores(px, w20)
    gs_z    = _safe_last(z_s, 0.0)
    ou_z    = float((px_raw[-1] - ou["theta"]) / max(ou_std, 1e-9))
    ou_signal  = "SELL" if ou_z > 2 else ("BUY" if ou_z < -2 else "NEUTRAL")
    ou_conf    = min(92, 50 + int(abs(ou_z) * 15)) if ou_signal != "NEUTRAL" else 40

    # ── 5. RSI  (gs-quant technicals.relative_strength_index) ────────────────
    rsi_s  = gstech.relative_strength_index(px, 14)
    rsi    = _safe_last(rsi_s, 50.0)
    rsi_signal = ("OVERBOUGHT" if rsi > 70 else
                  "OVERSOLD"   if rsi < 30 else "NEUTRAL")
    rsi_bias   = ("BEARISH" if rsi > 70 else
                  "BULLISH" if rsi < 30 else "NEUTRAL")

    # ── 6. MACD  (gs-quant technicals.macd) ──────────────────────────────────
    macd_s  = gstech.macd(px)
    macd    = _safe_last(macd_s, 0.0)
    macd_signal = "BULLISH" if macd > 0 else "BEARISH"

    # ── 7. Bollinger Bands  (gs-quant technicals.bollinger_bands) ────────────
    bb_s = gstech.bollinger_bands(px, w20)
    current_px = float(px_raw[-1])
    sma_s  = gstech.moving_average(px, w20)
    sma    = _safe_last(sma_s, current_px)
    std_s  = gsstat.std(px, w20)
    gsstd  = _safe_last(std_s, float(np.std(px_raw[-w20:])))
    bb_upper = sma + 2.0 * gsstd
    bb_lower = sma - 2.0 * gsstd
    bb_pct   = float((current_px - bb_lower) / max(bb_upper - bb_lower, 1e-9))  # 0=lower,1=upper
    bb_signal = ("NEAR UPPER BAND" if bb_pct > 0.85 else
                 "NEAR LOWER BAND" if bb_pct < 0.15 else "MID BAND")
    bb_bias   = ("BEARISH" if bb_pct > 0.85 else
                 "BULLISH" if bb_pct < 0.15 else "NEUTRAL")

    # ── 8. Momentum  (Jegadeesh & Titman 1993) ───────────────────────────────
    ret5  = float(px_raw[-1] / px_raw[max(-5,  -n)] - 1) if n >= 5  else 0.0
    ret20 = float(px_raw[-1] / px_raw[max(-20, -n)] - 1) if n >= 20 else 0.0
    mom_signal = ("BULLISH" if ret5 > 0 and ret20 > 0 else
                  "BEARISH" if ret5 < 0 and ret20 < 0 else "MIXED")

    # ── 9. Carry  (Uncovered Interest Parity, Fama 1984) ─────────────────────
    carry_diff   = r_d - r_f
    carry_signal = ("BUY BASE"  if carry_diff >  0.005 else
                    "SELL BASE" if carry_diff < -0.005 else "NEUTRAL")

    # ── Composite signal (8 inputs, gs-quant enhanced) ────────────────────────
    bull = sum([
        ret5 > 0, ret20 > 0,
        ou_signal    == "BUY",
        carry_signal == "BUY BASE",
        macd_signal  == "BULLISH",
        rsi_bias     == "BULLISH",
        bb_bias      == "BULLISH",
        hurst_regime == "TRENDING" and ret5 > 0,
    ])
    bear = sum([
        ret5 < 0, ret20 < 0,
        ou_signal    == "SELL",
        carry_signal == "SELL BASE",
        macd_signal  == "BEARISH",
        rsi_bias     == "BEARISH",
        bb_bias      == "BEARISH",
        hurst_regime == "TRENDING" and ret5 < 0,
    ])
    if bull >= bear + 3:
        composite, conf = "BULLISH", min(95, 50 + bull * 6)
    elif bear >= bull + 3:
        composite, conf = "BEARISH", min(95, 50 + bear * 6)
    elif bull > bear:
        composite, conf = "BULLISH", min(70, 50 + bull * 4)
    elif bear > bull:
        composite, conf = "BEARISH", min(70, 50 + bear * 4)
    else:
        composite, conf = "NEUTRAL", 45

    return {
        "composite":     composite,
        "confidence":    conf,
        "n_observations": n,
        "powered_by":    "gs-quant (Goldman Sachs) + custom quant models",

        "volatility": {
            "hv_20_pct":          round(hv20, 2),
            "hv_60_pct":          round(hv60, 2),
            "regime":             vol_regime,
            "ewma_forecast_pct":  round(ewma_vol * 100, 2),
            "max_drawdown_pct":   round(max_dd * 100, 2),
            "method": "gs-quant econometrics.volatility() + EWMA λ=0.94 (RiskMetrics 1994)",
        },
        "risk": {
            "var_95_pct":   round(var95  * 100, 3),
            "var_99_pct":   round(var99  * 100, 3),
            "cvar_95_pct":  round(cvar95 * 100, 3),
            "method": "Parametric Normal VaR / Historical CVaR (Basel III)",
        },
        "hurst": {
            "exponent": round(hurst, 3),
            "regime":   hurst_regime,
            "action":   hurst_action,
            "method":   "Variance-scaling estimator (Hurst 1951)",
        },
        "mean_reversion": {
            "kappa":          ou["kappa"],
            "theta":          ou["theta"],
            "half_life_days": ou["half_life_days"],
            "zscore":         round(ou_z, 2),
            "gs_zscore":      round(gs_z, 2),
            "signal":         ou_signal,
            "confidence":     ou_conf,
            "method": "OLS AR(1) → OU SDE (Uhlenbeck & Ornstein 1930) + gs-quant zscores",
        },
        "rsi": {
            "value":   round(rsi, 2),
            "signal":  rsi_signal,
            "bias":    rsi_bias,
            "method":  "gs-quant technicals.relative_strength_index(14) (Wilder 1978)",
        },
        "macd": {
            "value":   round(macd, 6),
            "signal":  macd_signal,
            "method":  "gs-quant technicals.macd() — 12/26/9 EMA crossover (Appel 1979)",
        },
        "bollinger": {
            "upper":   round(bb_upper, 5),
            "lower":   round(bb_lower, 5),
            "sma":     round(sma, 5),
            "pct_b":   round(bb_pct, 3),
            "signal":  bb_signal,
            "bias":    bb_bias,
            "method":  "gs-quant technicals.bollinger_bands(20,2σ) (Bollinger 1983)",
        },
        "momentum": {
            "return_5d_pct":  round(ret5  * 100, 3),
            "return_20d_pct": round(ret20 * 100, 3),
            "signal":  mom_signal,
            "method":  "Price momentum (Jegadeesh & Titman 1993)",
        },
        "carry": {
            "r_d":             round(r_d * 100, 2),
            "r_f":             round(r_f * 100, 2),
            "differential_pct": round(carry_diff * 100, 2),
            "signal":  carry_signal,
            "method":  "Uncovered Interest Parity (Fama 1984)",
        },
    }
