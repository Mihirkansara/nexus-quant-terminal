"""Margin Desk: SPAN / PM scenario identities, monotonicity, margin-call probabilities, endpoint."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.margin import liquidation_ladder, margin_call_sim, pm_margin, span_margin
from app.main import app

client = TestClient(app)
S, SIG, RD = 4400.0, 0.2, 0.05
STRADDLE = [{"type": "call", "K": 4400, "T": 1 / 12, "qty": -1}, {"type": "put", "K": 4400, "T": 1 / 12, "qty": -1}]


def test_linear_book_identities():
    sp = span_margin([], S, SIG, RD, 0, 5, 4, hedge_units=10)
    assert sp["requirement"] == pytest.approx(10 * S * 0.05)                 # full scan range move
    pm = pm_margin([], S, SIG, RD, 0, hedge_units=10)
    assert pm["initial"] == pytest.approx(10 * S * 0.16 + 0.006 * 10 * S)     # ±16 % move + 0.6 % delta contingency
    assert pm["maintenance"] == pytest.approx(0.8 * pm["initial"])


def test_option_book_scenarios():
    short = span_margin(STRADDLE, S, SIG, RD, 0, 5, 4)
    long_ = span_margin([{**l, "qty": 1} for l in STRADDLE], S, SIG, RD, 0, 5, 4)
    assert long_["worst_scenario"] == 2                                        # price unchanged, vol down
    assert short["scan_risk"] > long_["scan_risk"]
    assert short["short_option_minimum"] == pytest.approx(2 * S * 0.5 / 100)   # 2 shorts × 10 % of a 5 % scan range
    assert len(short["scenarios"]) == 16
    hiked = span_margin(STRADDLE, S, SIG, RD, 0, 7.5, 6)
    assert hiked["requirement"] > short["requirement"]                         # margin hike raises the requirement
    pm = pm_margin(STRADDLE, S, SIG, RD, 0)
    assert pm["initial"] > 0 and pm["worst_extended"] > 0


def test_margin_call_probability_monotone_in_equity():
    im = span_margin(STRADDLE, S, SIG, RD, 0, 5, 4)["requirement"]
    p = [margin_call_sim(STRADDLE, S, SIG, RD, 0, im * m, "span", {"psr_pct": 5, "vsr_pts": 4}, days=10, n_paths=1500,
                         ppy=252)["p_margin_call"] for m in (0.99, 1.5, 5.0)]
    assert p[0] > 0.9 and p[0] > p[1] > p[2] and p[2] < 0.01
    lad = liquidation_ladder(STRADDLE, S, SIG, RD, 0, im * 1.5, "span", {"psr_pct": 5, "vsr_pts": 4})
    base, stressed = lad
    assert base["call_below"] < S < base["call_above"]
    assert stressed["in_call_now"] or (stressed["call_below"] >= base["call_below"] and stressed["call_above"] <= base["call_above"])
    assert not base["in_call_now"]
    tight = liquidation_ladder(STRADDLE, S, SIG, RD, 0, im * 0.5, "span", {"psr_pct": 5, "vsr_pts": 4})
    assert tight[0]["in_call_now"] and tight[0]["call_below"] is None


def test_endpoint():
    body = {"pair": "XAGUSD", "S": 64.5, "sigma": 0.4, "r_d": 0.039, "r_f": 0.02, "days": 5,
            "options": [{"type": "call", "K": 70, "T": 0.25, "qty": -10}, {"type": "put", "K": 59, "T": 0.25, "qty": -10}]}
    r = client.post("/api/margin/book", json=body)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["method"] == "span" and js["psr_pct"] == 10.0
    assert js["hike"]["requirement"] > js["maintenance"] and len(js["ladder"]) == 2
    assert 0 <= js["simulation"]["p_margin_call"] <= 1
    btc = client.post("/api/margin/book", json={**body, "pair": "BTCUSD", "S": 83000, "sigma": 0.5,
                                                 "options": [{"type": "call", "K": 90000, "T": 0.1, "qty": -1}]})
    assert btc.status_code == 200 and btc.json()["method"] == "pm"
    wide = span_margin([], 83000.0, 0.5, 0.04, 0, 40, 15, hedge_units=1)            # 3 × 40 % scan > 100 %
    assert np.isfinite(wide["requirement"]) and wide["scenarios"][15]["pnl"] >= -83000
    assert client.post("/api/margin/book", json={**body, "options": []}).status_code == 422
    assert client.post("/api/margin/book", json={**body, "pair": "NOPE"}).status_code == 404
