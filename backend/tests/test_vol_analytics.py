"""Validation of the Vol Lab analytics against a known synthetic SVI surface.

Run from backend/:  python -m pytest tests -q
"""
import numpy as np
from fastapi.testclient import TestClient
from scipy.stats import norm

from app.core.quant_analysis import compute_signals
from app.core.vol_analytics import (build_crypto_surface, constant_maturity_atm,
                                    parse_deribit_instrument, svi_total_variance, vol_cone)
from app.main import app
from app.routers import vol as vol_router
from tests.fixtures import NOW_MS, deribit_book


def _gbm(vol, n, ppy, seed=0, s0=100.0):
    rng = np.random.default_rng(seed)
    return s0 * np.exp(np.cumsum(rng.standard_normal(n) * vol / np.sqrt(ppy)))


def test_svi_fit_recovers_known_surface_and_25_delta_strikes():
    rows, truth = deribit_book()
    expiries = build_crypto_surface(rows, NOW_MS)
    assert len(expiries) == len(truth)
    for e in expiries:
        p, T, F = truth[e["expiry"]]
        assert abs(e["atm_vol"] - np.sqrt(svi_total_variance(0, *p) / T)) < 1e-4
        assert e["fit_rmse"] < 1e-4 and e["butterfly_arb_free"]
        d1 = lambda K, s: (np.log(F / K) + 0.5 * s * s * T) / (s * np.sqrt(T))
        assert abs(norm.cdf(d1(e["K_25c"], e["vol_25c"])) - 0.25) < 1e-6
        assert abs(norm.cdf(d1(e["K_25p"], e["vol_25p"])) - 0.75) < 1e-6
        assert e["rr25"] < 0          # BTC-style put skew in the fixture


def test_noisy_quotes_fit_within_noise():
    rows, _ = deribit_book(noise=0.02, rng=np.random.default_rng(7))
    for e in build_crypto_surface(rows, NOW_MS):
        assert e["fit_rmse"] < 0.015


def test_constant_maturity_interpolates_total_variance():
    expiries = build_crypto_surface(deribit_book()[0], NOW_MS)
    iv30 = constant_maturity_atm(expiries, 30)
    near = min(expiries, key=lambda e: abs(e["days"] - 30))
    assert abs(iv30 - near["atm_vol"]) < 2e-3


def test_parse_instrument():
    exp, K, cp = parse_deribit_instrument("ETH-5OCT26-2650-P")
    assert (exp.year, exp.month, exp.day, exp.hour, K, cp) == (2026, 10, 5, 8, 2650.0, "put")
    assert parse_deribit_instrument("BTC-PERPETUAL") is None


def test_vol_cone_matches_true_vol_on_both_calendars():
    btc = vol_cone(_gbm(0.50, 730, 365), 365)
    fx = vol_cone(_gbm(0.07, 520, 252), 252)
    assert abs(next(t for t in btc["tenors"] if t["tenor"] == "3M")["median"] - 0.50) < 0.03
    assert abs(next(t for t in fx["tenors"] if t["tenor"] == "3M")["median"] - 0.07) < 0.005
    assert next(t for t in fx["tenors"] if t["tenor"] == "1M")["window"] == 21


def test_signals_use_asset_calendar():
    px = _gbm(0.50, 90, 365, s0=83000)
    crypto = compute_signals(list(px), 0.039, 0.0, periods_per_year=365)
    as_fx = compute_signals(list(px), 0.039, 0.0, periods_per_year=252)
    ratio = crypto["volatility"]["ewma_forecast_pct"] / as_fx["volatility"]["ewma_forecast_pct"]
    assert abs(ratio - np.sqrt(365 / 252)) < 1e-3       # outputs are rounded to 2dp
    assert 20 < crypto["volatility"]["hv_20_pct"] < 90     # percent, not decimal


def test_endpoints_with_mocked_sources(monkeypatch):
    rows, _ = deribit_book()
    closes = list(_gbm(0.45, 730, 365, s0=83000))

    def fake_deribit(method, **params):
        return {
            "get_book_summary_by_currency": rows,
            "get_index_price": {"index_price": 83000.0},
            "get_volatility_index_data": {"data": [[NOW_MS - i * 864e5, 40, 41, 37, 38.1]
                                                   for i in range(5, 0, -1)]},
            "get_tradingview_chart_data": {"close": closes},
        }[method]

    monkeypatch.setattr(vol_router, "_deribit", fake_deribit)
    monkeypatch.setattr(vol_router, "_yf_closes", lambda sym, period="2y": closes)
    vol_router._cache.clear()
    c = TestClient(app)

    r = c.get("/api/vol/crypto/btc")
    assert r.status_code == 200
    d = r.json()
    assert d["dvol"]["last"] == 0.381 and d["index_price"] == 83000.0
    assert d["expiries"] and d["iv_30d"] and d["rv_30d"] and d["vrp_30d"] is not None
    assert abs(d["vrp_30d"] - (d["iv_30d"] - d["rv_30d"])) < 1e-5

    cone = c.get("/api/vol/cone/XAGUSD").json()
    assert cone["asset_class"] == "metal" and cone["periods_per_year"] == 252
    assert c.get("/api/vol/cone/BTCUSD").json()["periods_per_year"] == 365
    assert c.get("/api/vol/crypto/DOGE").status_code == 404
    assert c.get("/api/vol/cone/FOO").status_code == 404
    pairs = {p["pair"]: p for p in c.get("/api/forex/pairs").json()}
    assert {"XAGUSD", "BTCUSD", "ETHUSD"} <= set(pairs)
    assert pairs["ETHUSD"]["asset_class"] == "crypto" and "sym" not in pairs["ETHUSD"]


def test_crypto_endpoint_fails_gracefully(monkeypatch):
    def down(method, **params):
        raise ConnectionError("deribit down")
    monkeypatch.setattr(vol_router, "_deribit", down)
    vol_router._cache.clear()
    r = TestClient(app).get("/api/vol/crypto/ETH")
    assert r.status_code == 503 and "Deribit data unavailable" in r.json()["detail"]
