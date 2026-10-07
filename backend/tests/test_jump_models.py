"""Validation of Merton / Bates pricing and calibration.

Run from backend/:  python -m pytest tests -q
"""
import numpy as np
from fastapi.testclient import TestClient

from app.core.jump_models import (BATES_NAMES, MERTON_NAMES, bates_density, bates_price, black,
                                  calibrate, implied_vol, jump_stats, merton_as_bates,
                                  merton_price, model_smile)
from app.core.vol_analytics import build_crypto_surface
from app.main import app
from app.routers import jumps as jumps_router
from app.routers import vol as vol_router
from tests.fixtures import NOW_MS, deribit_book

F, T = 83000.0, 30 / 365
K = np.linspace(60000, 110000, 11)
BATES = (0.20, 2.0, 0.25, 1.2, -0.4, 4.0, -0.06, 0.10)


def test_limits_parity_and_density():
    assert np.allclose(merton_price(F, K, T, 0.45, 0, 0, 0.1), black(F, K, T, 0.45))
    m = merton_price(F, K, T, 0.40, 6, -0.03, 0.08)
    assert np.allclose(bates_price(F, K, T, merton_as_bates(0.40, 6, -0.03, 0.08)), m, rtol=1e-5)
    assert np.allclose(bates_price(F, K, T, (0.16, 5, 0.16, 1e-4, 0, 0, 0, 0.1)), black(F, K, T, 0.4), rtol=1e-4)
    c, p = bates_price(F, K, T, BATES, True), bates_price(F, K, T, BATES, False)
    assert np.allclose(c - p, F - K, atol=1e-6)
    x = np.linspace(-1.5, 1.2, 2001)
    d = bates_density(T, BATES, x)
    assert abs(np.trapezoid(d, x) - 1) < 1e-6 and abs(np.trapezoid(d * np.exp(x), x) - 1) < 1e-6
    assert np.allclose(implied_vol(black(F, K, T, 0.5), F, K, T), 0.5, atol=1e-7)


def test_merton_matches_exact_monte_carlo():
    rng = np.random.default_rng(1)
    n, lam, mu, dl, sig = 400_000, 6.0, -0.03, 0.08, 0.40
    k = np.exp(mu + 0.5 * dl ** 2) - 1
    N = rng.poisson(lam * T, n)
    x = (-lam * k * T - 0.5 * sig ** 2 * T + sig * np.sqrt(T) * rng.standard_normal(n)
         + N * mu + np.sqrt(N) * dl * rng.standard_normal(n))
    ST = F * np.exp(x)
    for KK in (70000, 83000, 100000):
        pay = np.maximum(ST - KK, 0)
        assert abs(merton_price(F, [KK], T, sig, lam, mu, dl)[0] - pay.mean()) < 4 * pay.std() / np.sqrt(n)


def test_bates_matches_monte_carlo():
    rng = np.random.default_rng(0)
    n, steps = 100_000, 100
    dt = T / steps
    v0, ka, th, xi, rho, lam, mu, dl = BATES
    k = np.exp(mu + 0.5 * dl ** 2) - 1
    v, x = np.full(n, v0), np.zeros(n)
    for _ in range(steps):
        z1 = rng.standard_normal(n)
        z2 = rho * z1 + np.sqrt(1 - rho ** 2) * rng.standard_normal(n)
        vp = np.maximum(v, 0)
        N = rng.poisson(lam * dt, n)
        x += -0.5 * vp * dt - lam * k * dt + np.sqrt(vp * dt) * z1 + N * mu + np.sqrt(N) * dl * rng.standard_normal(n)
        v += ka * (th - vp) * dt + xi * np.sqrt(vp * dt) * z2
    ST = F * np.exp(x)
    for KK in (70000, 83000, 95000):
        pay = np.maximum(ST - KK, 0)
        se = pay.std() / np.sqrt(n)
        assert abs(bates_price(F, [KK], T, BATES)[0] - pay.mean()) < 4 * se + 0.005 * pay.mean()


def _surface(model, p, noise=0.0, seed=0):
    rng = np.random.default_rng(seed)
    names = MERTON_NAMES if model == "merton" else BATES_NAMES
    out = []
    for days in (7, 14, 30, 60, 91, 182):
        t = days / 365
        f = F * np.exp(0.04 * t)
        sd = 0.45 * np.sqrt(t)
        strikes = f * np.exp(np.linspace(-2.2 * sd, 2.2 * sd, 25))
        iv = model_smile(model, dict(zip(names, p)), f, t, strikes)
        out.append({"T": t, "forward": f, "strikes": strikes.tolist(),
                    "iv": (iv * (1 + noise * rng.standard_normal(len(iv)))).tolist()})
    return out


def test_calibration_recovers_parameters():
    m = calibrate(_surface("merton", (0.38, 8.0, -0.04, 0.09)), "merton")
    assert m["rmse_vol"] < 1e-4
    assert np.allclose(list(m["params"].values()), [0.38, 8.0, -0.04, 0.09], rtol=1e-3, atol=1e-4)
    b = calibrate(_surface("bates", BATES), "bates")
    assert b["rmse_vol"] < 1e-3
    noisy = calibrate(_surface("bates", BATES, noise=0.01, seed=3), "bates")
    assert noisy["rmse_vol"] < 0.008 and abs(noisy["params"]["rho"] - BATES[4]) < 0.15
    # A pure-jump model cannot fit a stochastic-vol surface as well.
    assert calibrate(_surface("bates", BATES), "merton")["rmse_vol"] > 5 * b["rmse_vol"]
    s = jump_stats(b["params"])
    assert 0 < s["p_crash_jump"] < 1 and 0 < s["jump_variance_share"] < 1


def test_endpoints(monkeypatch):
    rows, _ = deribit_book(spot=83000)
    exps = build_crypto_surface(rows, NOW_MS)
    monkeypatch.setattr(vol_router, "get_crypto_vol", lambda ccy: {"expiries": exps, "index_price": 83000.0})
    jumps_router._cache.clear()
    c = TestClient(app)
    d = c.get("/api/jumps/calibrate/btc").json()
    assert set(d["fits"]) == {"merton", "bates"}
    assert d["fits"]["bates"]["rmse_vol"] <= d["fits"]["merton"]["rmse_vol"] + 1e-6
    assert len(d["smiles"]) >= 5 and len(d["smiles"][0]["bates"]) == 40
    assert 0 < d["density_30d"]["p_down_20"] < 1
    assert c.get("/api/jumps/calibrate/DOGE").status_code == 404
    body = {"pair": "XAGUSD", "S": 61.2, "T": 0.25, "r_d": 0.039, "r_f": 0.02, "sigma": 0.30,
            "jump_intensity": 3, "jump_mean": -0.05, "jump_sd": 0.06}
    r = c.post("/api/jumps/merton", json=body).json()
    assert len(r["iv"]) == 41 and r["rr_approx"] < 0           # down-jumps → put skew
    assert c.post("/api/jumps/merton", json={**body, "pair": "NOPE"}).status_code == 404

    def boom(ccy):
        from fastapi import HTTPException
        raise HTTPException(503, "Deribit down")
    monkeypatch.setattr(vol_router, "get_crypto_vol", boom)
    jumps_router._cache.clear()
    assert c.get("/api/jumps/calibrate/ETH").status_code == 503
