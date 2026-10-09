"""Exotics desk: Haug reference values, parity, BGK vs Monte Carlo, touches, DCI, accumulator."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.exotics import (accumulator_report, barrier_mc, barrier_price, dci_quote,
                              digital_prices, gk_vanilla, simulate_paths, touch_prices)
from app.main import app

S, T, R, Q, V = 100.0, 0.5, 0.08, 0.04, 0.25
client = TestClient(app)


@pytest.mark.parametrize("cp,d,k,K,H,ref", [
    # Haug (2007) Table 4-13, rebate 3.
    ("call", "down", "out", 90, 95, 9.0246), ("call", "down", "in", 90, 95, 7.7627),
    ("call", "up", "out", 90, 105, 2.6789), ("call", "up", "in", 90, 105, 14.1112),
    ("put", "down", "out", 90, 95, 2.2798), ("put", "down", "in", 90, 95, 2.9586),
    ("put", "up", "out", 90, 105, 3.7760), ("put", "up", "in", 90, 105, 1.4653),
])
def test_haug_table(cp, d, k, K, H, ref):
    assert barrier_price(S, K, H, T, R, Q, V, cp == "call", d, k, 3.0) == pytest.approx(ref, abs=1e-4)


def test_in_out_parity_and_breached():
    for cp in (True, False):
        for d, H in (("down", 95), ("up", 105)):
            for K in (90, 100, 110):
                tot = barrier_price(S, K, H, T, R, Q, V, cp, d, "in") + barrier_price(S, K, H, T, R, Q, V, cp, d, "out")
                assert tot == pytest.approx(gk_vanilla(S, K, T, R, Q, V, cp), abs=1e-9)
    assert barrier_price(S, 100, 101, T, R, Q, V, True, "down", "out", 2.0) == 2.0
    assert barrier_price(S, 100, 99, T, R, Q, V, True, "up", "in") == pytest.approx(gk_vanilla(S, 100, T, R, Q, V))


@pytest.mark.parametrize("K,H,c,d,k", [(100, 95, True, "down", "out"), (100, 105, False, "up", "in")])
def test_bgk_matches_discrete_mc(K, H, c, d, k):
    mc, se = barrier_mc(S, K, H, T, R, Q, V, c, d, k, n_steps=126, n_paths=100_000)
    bgk = barrier_price(S, K, H, T, R, Q, V, c, d, k, monitoring_per_year=252)
    cont = barrier_price(S, K, H, T, R, Q, V, c, d, k)
    assert abs(bgk - mc) < 4 * se + 0.01
    assert abs(cont - mc) > abs(bgk - mc)


def test_touches_vs_mc():
    t = touch_prices(S, 110, T, R, Q, V, monitoring_per_year=252)
    p = simulate_paths(S, T, R, Q, V, 126, 100_000, np.random.default_rng(1))
    nt = np.exp(-R * T) * (~(p >= 110).any(axis=1)).mean()
    assert t["no_touch"] == pytest.approx(nt, abs=0.006)
    assert t["no_touch"] + t["one_touch_at_expiry"] == pytest.approx(np.exp(-R * T))
    assert t["one_touch_at_hit"] > t["one_touch_at_expiry"]          # paid earlier when r > 0


def test_smile_digital_is_minus_dC_dK():
    """With a skewed σ(K) the digital equals the finite-difference −∂C/∂K."""
    sig = lambda K: 0.25 - 0.002 * (K - 100)
    K, h = 102.0, 1e-3
    fd = -(gk_vanilla(S, K + h, T, R, Q, sig(K + h)) - gk_vanilla(S, K - h, T, R, Q, sig(K - h))) / (2 * h)
    d = digital_prices(S, K, T, R, Q, 0.25, smile_vol=sig(K), smile_slope=-0.002)
    assert d["call_smile"] == pytest.approx(fd, abs=1e-6)
    assert d["call_smile"] > d["call_flat"]                          # negative skew richens call digitals


def test_dci_fair_apr_and_implied_vol():
    q = dci_quote(60000, 65000, 7 / 365, 0.04, 0.0, 0.5, "sell_high")
    assert 0 < q["prob_conversion"] < 0.5 and q["fair_apr"] > 0
    audit = dci_quote(60000, 65000, 7 / 365, 0.04, 0.0, 0.5, "sell_high", offered_apr=q["fair_apr"] * 0.8)
    assert audit["margin_apr"] > 0 and audit["implied_vol_paid"] < 0.5
    hi = dci_quote(60000, 65000, 7 / 365, 0.04, 0.0, 0.8, "sell_high")
    assert hi["fair_apr"] > q["fair_apr"]


def test_accumulator_zero_cost():
    rep = accumulator_report(S, 0.5, 0.04, 0.0, 0.3, ko_pct=105, n_paths=5000)
    assert abs(rep["pv_to_client"]) < 1e-6
    assert rep["zero_cost_strike"] < S and 0 < rep["prob_knock_out"] < 1
    j = accumulator_report(S, 0.5, 0.04, 0.0, 0.3, ko_pct=105, n_paths=5000,
                           jump={"lambda": 4, "mean": -0.05, "sd": 0.05})
    assert j["pnl"]["p01"] < rep["pnl"]["p01"]                        # crash jumps fatten the loss tail


def test_endpoints():
    base = {"pair": "XAUUSD", "S": 2650, "T": 0.25, "r_d": 0.0525, "r_f": 0.0, "sigma": 0.18}
    r = client.post("/api/exotics/barrier", json={**base, "K": 2650, "H_down": 2450, "H_up": 2850,
                                                  "rr25": 0.02, "bf25": 0.005})
    assert r.status_code == 200, r.text
    js = r.json()
    assert len(js["rows"]) == 8 and len(js["touch_ladder"]) == 24
    assert js["digital"]["smile_adjustment"] != 0
    assert client.post("/api/exotics/barrier", json={**base, "K": 2650, "H_down": 2700, "H_up": 2850}).status_code == 422
    r = client.post("/api/exotics/dci", json={**base, "pair": "BTCUSD", "S": 60000, "T": 7 / 365, "sigma": 0.5,
                                              "offered_apr": 0.3, "strike_pct_offer": 105})
    assert r.status_code == 200 and all(x["strike_pct"] > 100 for x in r.json()["ladder"])
    r = client.post("/api/exotics/accumulator", json={**base, "n_paths": 2000})
    assert r.status_code == 200 and r.json()["zero_cost_strike"] < 2650
    assert client.post("/api/exotics/dci", json={**base, "pair": "NOPE"}).status_code == 404
