"""TARF desk: SSVI fit, Dupire consistency, payoff mechanics, limits, model spread, endpoint."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.exotics import gk_vanilla
from app.core.tarf import (fit_ssvi, simulate, ssvi_implied_vol, tarf_cashflows, tarf_report)
from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("atm,rr,bf,T", [(0.18, 0.02, 0.004, 0.5), (0.55, -0.06, 0.02, 0.25), (0.08, -0.005, 0.002, 0.5)])
def test_ssvi_reproduces_quotes_and_is_arbitrage_free(atm, rr, bf, T):
    f = fit_ssvi(atm, rr, bf, T)
    assert f["fit_error"] < 1e-6 and f["arb_free"]
    assert ssvi_implied_vol(0.0, T, atm, f["rho"], f["eta"]) == pytest.approx(atm, abs=1e-12)
    assert np.sign(f["rho"]) == np.sign(rr)


def test_local_vol_reprices_vanillas():
    S, rd, rf, T, atm = 62000.0, 0.04, 0.0, 0.5, 0.55
    f = fit_ssvi(atm, -0.06, 0.02, T)
    p = simulate(S, rd, rf, [T], "lv", atm, 120000, np.random.default_rng(2), ssvi=f, substeps=100)[:, 0]
    F = S * np.exp(rd * T)
    assert p.mean() == pytest.approx(F, rel=1e-9)                         # forward matched exactly
    for k in (-0.3, 0.0, 0.3):
        K = F * np.exp(k)
        call = k >= 0
        mc = np.exp(-rd * T) * (np.maximum(p - K, 0) if call else np.maximum(K - p, 0)).mean()
        bs = gk_vanilla(S, K, T, rd, rf, ssvi_implied_vol(k, T, atm, f["rho"], f["eta"]), call)
        assert mc == pytest.approx(bs, rel=0.04)


def test_payoff_mechanics():
    paths = np.array([[110, 95, 120, 130.0],          # gains 10, -2·5, 20 → acc 30 ≥ 25 at fixing 3
                      [90, 90, 90, 90.0]])            # never gains: loses 2·10 each fixing
    for typ, ko_pay in (("full", 20), ("exact", 15), ("none", 0)):
        cf, ko = tarf_cashflows(paths, 100, 25, side="buy", leverage=2, target_type=typ)
        assert list(ko) == [2, 4]
        assert cf[0].tolist() == [10, -10, ko_pay, 0]
        assert cf[1].tolist() == [-20, -20, -20, -20]
    cf, ko = tarf_cashflows(paths, 100, 25, side="sell", leverage=2)    # seller gains when spot < K
    assert list(ko) == [4, 2]
    assert cf[0].tolist() == [-20, 5, -40, -60] and cf[1].tolist() == [10, 10, 10, 0]


def test_forward_strip_limit_and_model_spread():
    rep = tarf_report(4400, 0.0525, 0.0, 0.18, side="buy", K=4400, target_pct=1e4 - 1, leverage=1.0,
                      rr25=0.02, bf25=0.004, n_paths=20000)
    for m, v in rep["models"].items():                                   # no target, no gearing → forward strip
        assert v["pv"] == pytest.approx(rep["forward_strip_pv"], abs=4 * v["pv_se"] + 1), m
        assert v["prob_ko"] == 0
    std = tarf_report(4400, 0.0525, 0.0, 0.18, side="buy", rr25=0.02, bf25=0.004, n_paths=10000)
    assert abs(std["models"]["lv"]["pv"]) < 1e-4 * 4400                  # zero-cost under the reference model (PV is piecewise in K)
    assert std["zero_cost_strike"] < std["forwards"][0]                  # gearing buys the client a better strike
    assert 0 < std["models"]["bs"]["prob_ko"] <= 1
    assert std["greeks"]["delta"] > 0                                     # importer is long the underlying
    assert std["models"]["bs"]["client_es_5"] > std["max_gain"]          # losses dwarf the capped gain


def test_no_target_matches_analytic_leveraged_forward_strip():
    """With no target, the zero-cost strike solves Σ C(K) = L·Σ P(K) over the fixings."""
    from scipy.optimize import brentq
    S, s, rd = 4400.0, 0.22, 0.0525
    r = tarf_report(S, rd, 0.0, s, side="buy", target_pct=9999, target_type="exact", rr25=0.01, bf25=0.004,
                    n_paths=20000, models=("bs",))
    fix = np.arange(1, 13) / 12
    Ka = brentq(lambda K: sum(gk_vanilla(S, K, t, rd, 0, s, True) - 2 * gk_vanilla(S, K, t, rd, 0, s, False)
                              for t in fix), 3000, 5000)
    assert r["zero_cost_strike"] == pytest.approx(Ka, rel=2e-3)


def test_endpoint():
    body = {"pair": "BTCUSD", "S": 62000, "sigma": 0.55, "r_d": 0.04, "r_f": 0.0, "side": "sell",
            "n_fix": 8, "freq_per_year": 52, "n_paths": 4000}
    r = client.post("/api/tarf/price", json=body)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["smile"]["source"] == "assumed" and set(js["models"]) == {"bs", "lv", "jump"}
    assert len(js["detail"]["ko_by_fixing"]) == 8
    assert client.post("/api/tarf/price", json={**body, "pair": "NOPE"}).status_code == 404
