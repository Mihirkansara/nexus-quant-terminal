"""Smile Dynamics: SABR formula limits & MC check, calibration, delta identities, backbone, regime, endpoints."""

from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import norm

from app.core.smile_dynamics import (backbone, calibrate_sabr, classify_regime, empirical_beta, hedge_ratios,
                                     sabr_vol, strike_for_delta)
from app.core.vol_analytics import build_crypto_surface
from app.main import app
from app.routers import eventvol as ev_router
from app.routers import risk as risk_router
from app.routers import vol as vol_router
from tests.fixtures import NOW_MS, deribit_book

client = TestClient(app)


def test_sabr_limits():
    K = np.array([80.0, 100, 120])
    assert np.allclose(sabr_vol(K, 100, 1, 0.2, 1.0, -0.3, 1e-8), 0.2, atol=1e-7)      # ν → 0: flat lognormal
    near = sabr_vol(np.array([100 * (1 - 1e-7), 100.0, 100 * (1 + 1e-7)]), 100, 0.5, 0.3, 0.5, -0.4, 0.8)
    assert np.ptp(near) < 1e-6                                                           # continuous at the money
    skew = sabr_vol(K, 100, 1, 0.2, 1.0, -0.5, 0.6)
    assert skew[0] > skew[2]                                                             # ρ < 0 → put skew


def test_sabr_matches_monte_carlo():
    rng = np.random.default_rng(0)
    n, steps, T, a, r, nu, F0 = 150000, 200, 0.25, 0.5, -0.3, 0.6, 60000.0
    dt = T / steps
    f, al = np.full(n, F0), np.full(n, a)
    for _ in range(steps):
        z1 = rng.standard_normal(n)
        z2 = r * z1 + np.sqrt(1 - r * r) * rng.standard_normal(n)
        f *= np.exp(al * np.sqrt(dt) * z1 - 0.5 * al * al * dt)
        al *= np.exp(nu * np.sqrt(dt) * z2 - 0.5 * nu * nu * dt)
    for K in (48000.0, 60000.0, 72000.0):
        sv = float(sabr_vol(K, F0, T, a, 1.0, r, nu))
        sq = sv * np.sqrt(T)
        d1 = (np.log(F0 / K) + 0.5 * sq * sq) / sq
        assert np.maximum(f - K, 0).mean() == pytest.approx(F0 * norm.cdf(d1) - K * norm.cdf(d1 - sq), rel=0.01)


def test_calibration_roundtrip_and_delta_identities():
    F, T = 60000.0, 0.25
    K = F * np.exp(np.linspace(-0.5, 0.5, 15))
    p = calibrate_sabr(K, sabr_vol(K, F, T, 0.55, 1.0, -0.25, 1.3), F, T)
    assert (p["alpha"], p["rho"], p["nu"]) == pytest.approx((0.55, -0.25, 1.3), rel=1e-4)
    Kc = strike_for_delta(F, T, p, 0.25, True)
    h = hedge_ratios(Kc, F, T, p, True)
    assert h["bs_sticky_strike"] == pytest.approx(0.25, abs=1e-6)
    assert h["sabr"] == pytest.approx(h["sticky_delta"], abs=1e-6)                       # β = 1 SABR is sticky-moneyness
    assert h["bartlett"] < h["sabr"]                                                     # ρ < 0 lowers call deltas
    pz = {**p, "rho": 0.0}
    hz = hedge_ratios(Kc, F, T, pz, True)
    assert hz["bartlett"] == pytest.approx(hz["sabr"], abs=1e-9)                         # ρ = 0 → no α-correction
    bb = backbone(F, T, p)
    assert bb["sabr"] == pytest.approx(0, abs=1e-9) and bb["bartlett"] < 0 and bb["sticky_strike"] < 0


def test_empirical_beta_and_regime():
    rng = np.random.default_rng(5)
    n = 600
    r = rng.normal(0, 0.03, n)
    dlv = -0.8 * r + rng.normal(0, 0.02, n)                                              # equity-like: vol up on sell-offs
    dates = [(date(2024, 1, 1) + timedelta(days=i)).isoformat() for i in range(n + 1)]
    emp = empirical_beta(dates, 60000 * np.exp(np.r_[0, np.cumsum(r)]), dates, 50 * np.exp(np.r_[0, np.cumsum(dlv)]))
    assert emp["beta_full"] == pytest.approx(-0.8, abs=0.1) and emp["corr_full"] < -0.5
    reg = classify_regime({"sticky_strike": -0.2, "sticky_delta": 0.0, "bartlett": -0.4}, -0.38)
    assert reg["closest"] == "bartlett"


def test_endpoints(monkeypatch):
    rows, _ = deribit_book(spot=83000)
    exps = build_crypto_surface(rows, NOW_MS)
    monkeypatch.setattr(vol_router, "get_crypto_vol", lambda ccy: {"expiries": exps, "index_price": 83000.0})
    monkeypatch.setattr(ev_router, "_load_history", lambda pair: None)
    r = client.get("/api/smiledyn/crypto/BTC")
    assert r.status_code == 200, r.text
    js = r.json()
    assert 3 <= len(js["expiries"]) <= 6 and js["empirical"] is None
    for e in js["expiries"]:
        assert e["params"]["rmse_vol"] < 0.02 and len(e["deltas"]) == 5
    rng = np.random.default_rng(1)
    d = [(date(2024, 1, 1) + timedelta(days=i)).isoformat() for i in range(500)]
    monkeypatch.setattr(ev_router, "_load_history", lambda pair: {"dates": d, "c": 4400 * np.exp(np.cumsum(rng.normal(0, .01, 500)))})
    monkeypatch.setattr(risk_router, "_iv_history", lambda pair: (d, (20 * np.exp(np.cumsum(rng.normal(0, .03, 500)))).tolist(), "GVZ"))
    q = client.post("/api/smiledyn/quotes", json={"pair": "XAUUSD", "S": 4400, "atm": 0.2, "rr25": 0.015, "bf25": 0.004})
    assert q.status_code == 200, q.text
    qj = q.json()
    assert qj["expiries"][0]["params"]["rho"] > 0 and qj["empirical"]["index"] == "GVZ" and qj["regime"] is not None
    assert client.get("/api/smiledyn/crypto/XRP").status_code == 404
    assert client.post("/api/smiledyn/quotes", json={"pair": "NOPE", "S": 1, "atm": 0.1}).status_code == 404
