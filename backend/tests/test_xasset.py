"""Validation of the cross-asset desk: Margrabe, cointegration, Kalman, correlations.

Run from backend/:  python -m pytest tests -q
"""
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.core.garman_kohlhagen import gk_price
from app.core.xasset import (adf_stat, engle_granger, ewma_corr, gsr_report, kalman_hedge,
                             margrabe, margrabe_mc, ou_fit, returns_frame)
from app.main import app
from app.routers import xasset as xasset_router

S1, S2, N, T = 61.2, 4190.0, 1e6, 0.25


def test_margrabe_matches_monte_carlo_limits_and_parity():
    n1, n2 = N / S1, N / S2
    m = margrabe(S1, S2, n1, n2, 0.45, 0.20, 0.75, T, 0.02, 0.003)
    mc, se = margrabe_mc(S1, S2, n1, n2, 0.45, 0.20, 0.75, T, 0.02, 0.003)
    assert abs(m["price"] - mc) < 4 * se
    # σ2 → 0 collapses to a Black-Scholes call on asset 1 struck at the asset-2 leg (r = 0).
    bs = gk_price(n1 * S1, n2 * S2, T, 0.0, 0.02, 0.45, "call")
    assert abs(margrabe(S1, S2, n1, n2, 0.45, 1e-9, 0.0, T, 0.02, 0.0)["price"] - bs) < 1e-4
    # Exchange-option parity: V(1→2) − V(2→1) = F1 − F2.
    rev = margrabe(S2, S1, n2, n1, 0.20, 0.45, 0.75, T, 0.003, 0.02)["price"]
    fwd = n1 * S1 * np.exp(-0.02 * T) - n2 * S2 * np.exp(-0.003 * T)
    assert abs(m["price"] - rev - fwd) < 1e-6
    # Analytic correlation sensitivity vs finite difference; higher ρ → cheaper.
    up = margrabe(S1, S2, n1, n2, 0.45, 0.20, 0.7505, T, 0.02, 0.003)["price"]
    assert abs((up - m["price"]) / 0.0005 - m["corr_sens"]) < 0.01 * abs(m["corr_sens"])
    assert m["corr_sens"] < 0
    assert abs(m["ratio_vol"] - np.sqrt(0.45**2 + 0.2**2 - 2 * 0.75 * 0.45 * 0.2)) < 1e-12


def test_cointegration_and_ou():
    rng = np.random.default_rng(0)
    x = np.cumsum(rng.standard_normal(750) * 0.01)
    e = np.zeros(750)
    for t in range(1, 750):
        e[t] = 0.95 * e[t - 1] + 0.01 * rng.standard_normal()
    assert engle_granger(1.1 * x + e, x)["cointegrated_5pct"]
    hits = sum(engle_granger(np.cumsum(np.random.default_rng(s).standard_normal(750) * 0.01), x)
               ["cointegrated_5pct"] for s in range(1, 21))
    assert hits <= 4                                   # ≈5% false-positive rate
    hls = []
    for s in range(20):
        r = np.random.default_rng(s)
        z = np.zeros(750)
        for t in range(1, 750):
            z[t] = 0.95 * z[t - 1] + 0.01 * r.standard_normal()
        hls.append(ou_fit(z)["half_life_days"])
    assert abs(np.median(hls) - np.log(2) / -np.log(0.95)) < 2.5
    assert adf_stat(np.cumsum(rng.standard_normal(500))) > -3.34


def test_kalman_tracks_drifting_hedge_ratio():
    rng = np.random.default_rng(0)
    bt = np.linspace(0.8, 1.2, 1000)
    x = np.cumsum(rng.standard_normal(1000) * 0.02) + 4.1
    y = 8.3 + bt * (x - x[:120].mean()) + rng.standard_normal(1000) * 0.004
    _, b, z = kalman_hedge(y, x)
    assert np.abs(b[200:] - bt[200:]).mean() < 0.03
    assert 0.6 < z[200:].std() < 1.3


def _fake_closes(n=900, seed=3):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2023-06-01", periods=n)
    C = np.array([[1, .8, .3], [.8, 1, .3], [.3, .3, 1]])
    z = rng.standard_normal((n, 3)) @ np.linalg.cholesky(C).T * np.array([.010, .020, .030])
    gold = 4190 * np.exp(np.cumsum(z[:, 0]))
    # Silver cointegrated with gold: log ratio is a mean-reverting AR(1).
    lr = np.zeros(n)
    for t in range(1, n):
        lr[t] = 0.97 * lr[t - 1] + 0.01 * rng.standard_normal()
    silver = gold / (67 * np.exp(lr))
    btc = 83000 * np.exp(np.cumsum(z[:, 2]))
    return pd.DataFrame({"XAUUSD": gold, "XAGUSD": silver, "BTCUSD": btc,
                         "ETHUSD": btc / 31 * np.exp(np.cumsum(rng.standard_normal(n) * 0.01)),
                         "US10Y": 4.2 + np.cumsum(rng.standard_normal(n) * 0.05)}, index=idx)


def test_reports_on_synthetic_market():
    closes = _fake_closes()
    rets = returns_frame(closes)
    assert abs(rets["US10Y"].iloc[-1] - (closes["US10Y"].iloc[-1] - closes["US10Y"].iloc[-2])) < 1e-12
    e = ewma_corr(rets)
    assert np.allclose(np.diag(e), 1) and np.allclose(e, e.T)
    g = gsr_report(closes["XAUUSD"], closes["XAGUSD"])
    assert abs(g["current"] - closes["XAUUSD"].iloc[-1] / closes["XAGUSD"].iloc[-1]) < 1e-9
    assert g["engle_granger"]["cointegrated_5pct"]
    assert 10 < g["ou"]["half_life_days"] < 60          # true ≈ 22.8 days
    assert abs(g["ou"]["mean_level"] - 67) < 3


def test_endpoints(monkeypatch):
    monkeypatch.setattr(xasset_router, "_load_closes", lambda period="3y": _fake_closes())
    xasset_router._cache.clear()
    c = TestClient(app)
    d = c.get("/api/xasset").json()
    assert set(d["correlations"]["assets"]) == {"XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "US10Y"}
    m90 = np.array(d["correlations"]["matrices"]["90d"])
    assert np.allclose(np.diag(m90), 1) and m90.shape == (5, 5)
    assert any(b["pair"] == "XAUUSD/XAGUSD" for b in d["correlations"]["breaks"])
    assert len(d["gsr"]["series"]["gsr"]) == 500 and len(d["gsr"]["kalman"]["z"]) == 500
    body = {"S1": S1, "S2": S2, "sigma1": .45, "sigma2": .2, "rho": .75, "T": T, "q1": .02, "q2": .003}
    r = c.post("/api/xasset/margrabe", json=body).json()
    assert 0 < r["price_pct"] < 20 and len(r["price_vs_rho"]) == 39
    assert all(a > b for a, b in zip(r["price_vs_rho"], r["price_vs_rho"][1:]))
    assert c.post("/api/xasset/margrabe", json={**body, "rho": 1.5}).status_code == 422

    def boom(period="3y"):
        raise ValueError("yahoo down")
    monkeypatch.setattr(xasset_router, "_load_closes", boom)
    xasset_router._cache.clear()
    assert c.get("/api/xasset").status_code == 503
