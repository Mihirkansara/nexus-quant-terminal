from datetime import date, timedelta

import numpy as np
from fastapi.testclient import TestClient

from app.core.jump_models import merton_price
from app.core.variance import (black76, bkm_moments, cboe_variance, constant_maturity, continuous_variance,
                               expiry_report, forward_vols, strike_grid, vol_swap_strike, vrp_history)
from app.main import app
from app.routers import variance as var_router
from tests.rv_book import NOW_MS, book

client = TestClient(app)
F, T = 83000.0, 30 / 365


def flat(s):
    return lambda K: np.full_like(np.asarray(K, float), s)


def test_black_scholes_limits():
    rep = expiry_report(flat(0.6), F, T, 0.6, volvol=1.0)
    assert abs(rep["var_vol"] - 0.6) < 1e-4                               # K_var = σ² under flat vol
    m = rep["moments"]
    assert abs(m["vol"] - 0.6) < 1e-4 and abs(m["skew"]) < 1e-3 and abs(m["kurtosis"] - 3) < 1e-3
    assert abs(m["mean_log"] + 0.5 * 0.36 * T) < 1e-6                     # E[ln S_T/F] = −σ²T/2
    assert abs(rep["density_mass"] - 1) < 1e-4
    assert abs(rep["expected_move_pct"] - 0.6 * np.sqrt(T) * np.sqrt(2 / np.pi)) < 5e-4
    assert abs(rep["vol_swap"] - rep["var_vol"] * np.exp(-T / 6)) < 1e-9 and rep["vol_swap"] < rep["var_vol"]
    q = rep["quantiles"]
    assert abs(q["0.5"]["level"] / F - np.exp(-0.18 * T)) < 2e-3          # lognormal median
    lad = {r["move"]: r for r in rep["ladder"]}
    assert lad[0.1]["p_touch"] == min(1, 2 * lad[0.1]["p_terminal_beyond"])
    assert lad[-0.2]["p_below"] < lad[-0.1]["p_below"] < lad[0.1]["p_below"]


def test_merton_variance_and_moments_match_cumulants():
    sig, lam, mj, d = 0.45, 3.0, -0.08, 0.12
    K = strike_grid(F, T, 0.6, n=2001, width=9)
    C, P = merton_price(F, K, T, sig, lam, mj, d, True), merton_price(F, K, T, sig, lam, mj, d, False)
    kv = continuous_variance(K, C, P, F, T)
    assert abs(kv - (sig ** 2 + 2 * lam * (np.exp(mj + d * d / 2) - 1 - mj))) < 1e-4
    k2 = sig ** 2 * T + lam * T * (mj ** 2 + d ** 2)
    k3 = lam * T * (mj ** 3 + 3 * mj * d ** 2)
    k4 = lam * T * (mj ** 4 + 6 * mj ** 2 * d ** 2 + 3 * d ** 4)
    m = bkm_moments(K, C, P, F, T)
    assert abs(m["variance"] - k2 / T) < 1e-3
    assert abs(m["skew"] - k3 / k2 ** 1.5) < 2e-3 and abs(m["kurtosis"] - (3 + k4 / k2 ** 2)) < 5e-3


def test_cboe_discrete_and_truncation():
    Ks = np.arange(40000, 140001, 500.0)
    c, p = black76(F, Ks, T, 0.6, True), black76(F, Ks, T, 0.6, False)
    assert abs(cboe_variance(Ks, c, p, F, T)["vol"] - 0.6) < 2e-4
    narrow = np.arange(72000, 96001, 2000.0)
    short = cboe_variance(narrow, black76(F, narrow, T, 0.6, True), black76(F, narrow, T, 0.6, False), F, T)
    assert short["vol"] < 0.58 and short["k0"] == 82000.0                  # truncation biases the index down
    bids = np.where((Ks < 60000) & (Ks > 58000), 0.0, 1.0)                # two zero bids at 58.5k and 59k...
    bids[(Ks == 58500) | (Ks == 59000)] = 0.0
    cut = cboe_variance(Ks, c, p, F, T, call_bids=np.ones_like(Ks), put_bids=bids)
    assert cut["k_min"] >= 59500                                          # ...stop the put wing there


def test_constant_maturity_forward_vols_and_swaps():
    assert abs(constant_maturity(20 / 365, 0.25, 40 / 365, 0.25) - 0.25) < 1e-12
    v = constant_maturity(20 / 365, 0.16, 40 / 365, 0.36)
    assert 0.16 < v < 0.36
    rows = [{"T": 0.1, "days": 36.5, "k_var": 0.36}, {"T": 0.2, "days": 73, "k_var": 0.25},
            {"T": 0.3, "days": 109.5, "k_var": 0.1}]
    fv = forward_vols(rows)
    assert abs(fv[0]["fwd_vol"] - np.sqrt((0.05 - 0.036) / 0.1)) < 1e-12 and fv[1]["calendar_arbitrage"]
    assert vol_swap_strike(0.36, 1.0, 0.0) == 0.6 and vol_swap_strike(None, 1, 1) is None


def test_vrp_history_short_variance_pays_when_implied_exceeds_realised():
    rng = np.random.default_rng(3)
    n = 700
    d0 = date(2024, 1, 1)
    dates = [d0 + timedelta(days=i) for i in range(n)]
    closes = 50000 * np.exp(np.cumsum(rng.normal(0, 0.4 / np.sqrt(365), n)))
    idx_dates = [x.isoformat() for x in dates]
    rep = vrp_history(idx_dates, [50.0] * n, dates, closes, 30, 365)
    assert rep["n"] == n - 30 and rep["hit_rate"] > 0.9
    assert abs(rep["mean_vrp"] - 0.1) < 0.03 and rep["mean_short_var_pnl"] > 0
    assert rep["series"][-1]["realised_fwd"] is None and rep["current_implied"] == 0.5
    assert rep["volvol"] == 0.0


def _patch(monkeypatch):
    opts, futs = book(days_list=(9, 30, 58))
    monkeypatch.setattr(var_router, "_chain", lambda ccy: (opts, 83000.0, NOW_MS, 46.0))
    rng = np.random.default_rng(1)
    dates = [date(2024, 1, 1) + timedelta(days=i) for i in range(1000)]
    closes = list(83000 * np.exp(np.cumsum(rng.normal(0, 0.4 / np.sqrt(365), 1000))))
    lv = list(45 + 5 * np.sin(np.arange(1000) / 40))
    monkeypatch.setattr(var_router, "_history", lambda pair: (dates, closes, [d.isoformat() for d in dates], lv, "DVOL"))


def test_crypto_endpoint(monkeypatch):
    _patch(monkeypatch)
    r = client.get("/api/variance/crypto/BTC")
    assert r.status_code == 200
    d = r.json()
    assert [round(e["days"]) for e in d["expiries"]] == [9, 30, 58]
    for e in d["expiries"]:
        assert e["listed"] and abs(e["listed"]["vol"] - e["var_vol"]) < 0.04   # listed strikes vs wide integral
        assert e["var_vol"] > e["atm_iv"]                                      # skewed smile: K_var above ATM
        assert e["moments"]["skew"] < 0 and e["moments"]["kurtosis"] > 3
        assert e["density"]["physical"] and abs(e["density_mass"] - 1) < 1e-3
    cm = d["constant_maturity_30d"]
    assert cm and not cm["extrapolated"] and cm["listed_vol"] and d["live_index"] == 46.0
    assert d["vrp"]["n"] == 700 and len(d["vrp"]["series"]) == 730 and d["vrp"]["index"] == "DVOL" and d["trailing_realised"]
    assert all(not f["calendar_arbitrage"] for f in d["forward_vols"])
    assert client.get("/api/variance/crypto/XRP").status_code == 404


def test_crypto_endpoint_offline(monkeypatch):
    def boom(ccy):
        raise RuntimeError("down")
    monkeypatch.setattr(var_router, "_chain", boom)
    assert client.get("/api/variance/crypto/ETH").status_code == 503


def test_smile_endpoint_for_metals(monkeypatch):
    monkeypatch.setattr(var_router, "_history", lambda pair: (None, None, None, None, None))
    body = {"pair": "XAUUSD", "S": 4100, "r_d": 0.04, "r_f": 0.0,
            "tenors": [{"T": 1 / 12, "atm": 0.2, "rr25": 0.0, "bf25": 0.0},
                       {"T": 0.25, "atm": 0.22, "rr25": 0.015, "bf25": 0.004}]}
    r = client.post("/api/variance/smile", json=body)
    assert r.status_code == 200
    d = r.json()
    e1, e3 = d["expiries"]
    assert abs(e1["var_vol"] - 0.2) < 2e-3 and abs(e1["moments"]["skew"]) < 0.02   # flat quotes → BS
    assert e3["moments"]["skew"] > 0 and e3["var_vol"] > 0.22                       # call skew (gold RR > 0)
    assert d["forward_vols"][0]["fwd_vol"] > 0.22 and d["vrp"] is None and d["volvol"] == 0.8
    assert client.post("/api/variance/smile", json={**body, "pair": "XXXYYY"}).status_code == 404
