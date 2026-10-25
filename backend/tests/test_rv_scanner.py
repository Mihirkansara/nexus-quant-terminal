"""RV Scanner: coin Black-76 inversion, carry maths, clean book → no signals, planted mispricings found, endpoint."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.rv_scanner import black76_coin, carry_report, implied_vol_coin, scan
from app.main import app
from app.routers import rvscan as rv_router
from tests.rv_book import NOW_MS, book

client = TestClient(app)
SPOT = 83000.0


def test_coin_black76_parity_and_inversion():
    F, K, T = 85000.0, 90000.0, 30 / 365
    c, p = black76_coin(F, K, T, 0.5, True), black76_coin(F, K, T, 0.5, False)
    assert (c - p) * F == pytest.approx(F - K, abs=1e-6)                       # forward-style parity in coin
    assert implied_vol_coin(c, F, K, T, True) == pytest.approx(0.5, abs=1e-6)
    assert implied_vol_coin(0.0, F, K, T, True) is None                       # below intrinsic bound


def test_carry():
    _, futs = book()
    carry = carry_report(futs, SPOT, NOW_MS)
    for f in carry["futures"]:
        assert f["basis_annual"] == pytest.approx(0.06, rel=0.05)              # planted 6 % simple basis
    assert carry["perpetual"]["funding_annual"] == pytest.approx(0.0001 * 3 * 365)


def test_clean_book_has_no_signals():
    opts, futs = book()
    rep = scan(opts, SPOT, NOW_MS, carry_report(futs, SPOT, NOW_MS), realised_30d=0.40)
    assert rep["ideas"] == [] and rep["static_arbitrage"] == []
    assert max(abs(p["mark_dev_bp"]) for p in rep["parity"]) < 0.01
    assert rep["parity_max_executable"] < 0                                   # spreads kill parity "arb"
    for e in rep["expiries"]:
        assert e["svi_rmse"] < 1e-3 and abs(e["fwd_vs_future_bp"]) < 1e-6
        assert e["vrp"] == pytest.approx(e["atm_iv"] - 0.40)


def test_planted_mispricings_are_found():
    opts, futs = book()
    target = next(o for o in opts if o["instrument_name"].endswith("-95000-C") and "24NOV26" in o["instrument_name"])
    # Rich call: mark 6 vol over the smile, quotes moved with it.
    F, K = target["underlying_price"], 95000.0
    T = 30 / 365 - 5 / (24 * 365)
    iv = target["mark_iv"] / 100 + 0.06
    for key, s in (("mark_price", 0), ("bid_price", -0.005), ("ask_price", 0.005)):
        target[key] = black76_coin(F, K, T, iv + s, True)
    target["mark_iv"] = iv * 100
    rep = scan(opts, SPOT, NOW_MS, carry_report(futs, SPOT, NOW_MS))
    top = rep["ideas"][0]
    assert top["instrument"] == target["instrument_name"] and top["side"].startswith("sell")
    assert top["residual"] > 0.04 and top["edge_usd"] > 0
    # A vertical-spread violation: a higher strike call priced above a lower one.
    opts2, futs2 = book()
    c1 = next(o for o in opts2 if o["instrument_name"].endswith("-90000-C") and "-3NOV26-" in o["instrument_name"])
    c2 = next(o for o in opts2 if o["instrument_name"].endswith("-91000-C") and "-3NOV26-" in o["instrument_name"])
    c2["mark_price"] = c1["mark_price"] * 1.05
    rep2 = scan(opts2, SPOT, NOW_MS, carry_report(futs2, SPOT, NOW_MS))
    assert any(a["type"].startswith("vertical") and a["strikes"] == [90000.0, 91000.0] for a in rep2["static_arbitrage"])
    assert any(p["strike"] == 91000.0 and abs(p["mark_dev_bp"]) > 1 for p in rep2["parity"])
    v = next(a for a in rep2["static_arbitrage"] if a["strikes"] == [90000.0, 91000.0])
    assert not v["executable"] and v["executable_usd"] < 0                    # marks only; the touch is fine
    c2["bid_price"] = c1["ask_price"] * 1.02                                   # now sell 91k bid > buy 90k ask
    rep3 = scan(opts2, SPOT, NOW_MS)
    v3 = next(a for a in rep3["static_arbitrage"] if a["strikes"] == [90000.0, 91000.0])
    assert v3["executable"] and v3["executable_usd"] > 0 and rep3["static_arbitrage"][0]["executable"]


def test_endpoint(monkeypatch):
    opts, futs = book()
    monkeypatch.setattr(rv_router, "_load", lambda ccy: (opts, futs, SPOT, NOW_MS, 0.42))
    r = client.get("/api/rvscan/BTC")
    assert r.status_code == 200, r.text
    js = r.json()
    assert len(js["expiries"]) == 3 and js["carry"]["perpetual"]["funding_annual"] > 0
    assert client.get("/api/rvscan/XRP").status_code == 404

    def boom(ccy):
        raise RuntimeError("offline")
    monkeypatch.setattr(rv_router, "_load", boom)
    assert client.get("/api/rvscan/ETH").status_code == 503
