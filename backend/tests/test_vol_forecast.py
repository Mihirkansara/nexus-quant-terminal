"""Validation of the vol forecast & regime engine on simulations with known answers.

Run from backend/:  python -m pytest tests -q
"""
import numpy as np
from fastapi.testclient import TestClient

import app.core.vol_forecast as vf
from app.main import app
from app.routers import vol as vol_router
from tests.vol_sim import dates, gjr_garch, ohlc_from_daily_vols, regime_vols


def _sv_path(n, base, phi, eta, rng):
    """AR(1) log-vol stochastic-volatility path (daily sd)."""
    lv = np.empty(n)
    lv[0] = np.log(base)
    for t in range(1, n):
        lv[t] = np.log(base) + phi * (lv[t - 1] - np.log(base)) + eta * rng.standard_normal()
    return np.exp(lv)


def _crypto_sample(seed=9, n=1300, weekend=0.5):
    rng = np.random.default_rng(seed)
    d = dates(n)
    wk = np.array([weekend if x.weekday() >= 5 else 1.0 for x in d[1:]])
    o, h, l, c = ohlc_from_daily_vols(_sv_path(n, 0.03, 0.97, 0.12, rng) * wk, rng, s0=83000)
    return o, h, l, c, d


def test_scaled_range_proxy_is_unbiased():
    rng = np.random.default_rng(0)
    o, h, l, c = ohlc_from_daily_vols(np.full(3000, 0.02), rng)
    v, r = vf.daily_variance(o, h, l, c)
    assert abs(v.mean() / 0.02 ** 2 - 1) < 0.03
    assert np.var(r ** 2) / np.var(v) > 3          # range proxy is far less noisy


def test_vectorised_gjr_filter_matches_recursion():
    p = (2e-5, 0.05, 0.08, 0.88)
    r = np.random.default_rng(1).standard_normal(400) * 0.02
    s = np.empty(401); s[0] = 4e-4
    for t in range(400):
        s[t + 1] = p[0] + (p[1] + p[2] * (r[t] < 0)) * r[t] ** 2 + p[3] * s[t]
    assert np.allclose(vf._gjr_filter(p, r, 4e-4), s, rtol=1e-12)


def test_gjr_garch_recovers_parameters():
    _, r = gjr_garch(4000, 2e-5, 0.05, 0.08, 0.88, np.random.default_rng(1))
    omega, a, g, b = vf.fit_gjr_garch(r)[0]
    assert abs(a - 0.05) < 0.03 and abs(g - 0.08) < 0.05 and abs(b - 0.88) < 0.04
    assert abs((a + g / 2 + b) - 0.97) < 0.015


def test_hmm_recovers_regimes():
    rng = np.random.default_rng(0)
    vols, states = regime_vols(2000, [0.01, 0.035], [0.98, 0.95], rng)
    m = vf.fit_hmm(vols * rng.standard_normal(2000))
    assert np.allclose(m["sd"], [0.01, 0.035], rtol=0.1)
    assert ((m["smoothed"][:, 1] > 0.5) == states).mean() > 0.93


def test_models_beat_ewma_and_weekend_feature_helps():
    o, h, l, c, d = _crypto_sample()
    rep = vf.forecast_report(o, h, l, c, dates=d, ppy=365)
    for hz in ("1D", "1W", "1M"):
        m = rep["scores"][hz]["models"]
        assert m["HAR-RV"]["qlike"] < m["EWMA"]["qlike"]
        assert m["Ensemble"]["qlike"] < m["EWMA"]["qlike"]
        assert abs(sum(rep["scores"][hz]["weights"].values()) - 1) < 1e-9
    assert rep["horizons"] == {"1D": 1, "1W": 7, "1M": 30}
    assert 0 <= rep["regime"]["p_turbulent_now"] <= 1
    with_dummy = rep["scores"]["1D"]["models"]["HAR-RV"]["qlike"]
    no_dates = vf.forecast_report(o, h, l, c, dates=None, ppy=365)
    assert with_dummy < 0.8 * no_dates["scores"]["1D"]["models"]["HAR-RV"]["qlike"]


def test_backtest_has_no_look_ahead():
    o, h, l, c, d = _crypto_sample(n=1200)
    v, r = vf.daily_variance(o, h, l, c, calib_end=900)
    wd = np.array([x.weekday() for x in d[1:]])
    har, extra, cal, _, w_m = vf.build_features(v, r, 365, wd)
    X = np.column_stack([har, extra, cal])
    blk, hz = 1000, 30
    fit, pred = np.arange(w_m + 5, blk - hz + 1), np.arange(blk, blk + 21)
    before, _ = vf._model_forecasts(fit, pred, hz, v, r, har, X, cal, True, vf.ewma_series(r), {}, blk)
    # Scramble everything after the last prediction origin: forecasts must not move.
    cut = pred[-1] + 1
    v2, r2 = v.copy(), r.copy()
    v2[cut:] *= 7.0
    r2[cut:] *= -3.0
    har2, extra2, cal2, _, _ = vf.build_features(v2, r2, 365, wd)
    X2 = np.column_stack([har2, extra2, cal2])
    after, _ = vf._model_forecasts(fit, pred, hz, v2, r2, har2, X2, cal2, True, vf.ewma_series(r2), {}, blk)
    for m in before:
        assert np.allclose(before[m], after[m]), m


def test_implied_signal_and_endpoint(monkeypatch):
    o, h, l, c, d = _crypto_sample(n=1100)
    data = {"dates": d, "o": o, "h": h, "l": l, "c": c}
    monkeypatch.setattr(vol_router, "_crypto_ohlc", lambda ccy: data)
    monkeypatch.setattr(vol_router, "_yf_ohlc", lambda sym, period="3y": data)
    monkeypatch.setattr(vol_router, "get_crypto_vol", lambda ccy: {
        "atm_term_structure": [{"tenor": "1W", "atm_vol": 2.0}], "iv_30d": 0.05,
        "dvol": {"last": 0.4, "series": []}})
    vol_router._cache.clear()
    client = TestClient(app)
    res = client.get("/api/vol/forecast/btcusd")
    assert res.status_code == 200
    j = res.json()
    assert j["implied_signals"]["1W"]["view"] == "IMPLIED RICH"      # 200% implied
    assert j["implied_signals"]["1M"]["view"] == "IMPLIED CHEAP"     # 5% implied
    assert len(j["backtest"]["dates"]) == len(j["backtest"]["realised"]) > 100
    xag = client.get("/api/vol/forecast/XAGUSD").json()
    assert xag["periods_per_year"] == 252 and xag["horizons"]["1M"] == 21
    assert xag["implied_signals"] == {}
    assert client.get("/api/vol/forecast/NOPE").status_code == 404

    short = {k: (v[:200] if k != "dates" else v[:200]) for k, v in data.items()}
    monkeypatch.setattr(vol_router, "_yf_ohlc", lambda sym, period="3y": short)
    vol_router._cache.clear()
    assert client.get("/api/vol/forecast/EURUSD").status_code == 503
