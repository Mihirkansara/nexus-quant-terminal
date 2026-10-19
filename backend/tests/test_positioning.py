"""Positioning Desk: Black-76 Greeks vs finite differences, GEX scaling, max pain, flip, endpoint."""

from datetime import timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import norm

from app.core.positioning import _greeks, positioning_report
from app.main import app
from app.routers import positioning as pos_router
from tests.fixtures import MON, NOW, NOW_MS, deribit_book

client = TestClient(app)


def _row(K, cp, oi, days=30, iv=50.0, F=60000.0, ccy="BTC"):
    exp = (NOW + timedelta(days=days)).replace(hour=8, minute=0)
    return {"instrument_name": f"{ccy}-{exp.day}{MON[exp.month - 1]}{exp.strftime('%y')}-{int(K)}-{cp}",
            "mark_iv": iv, "underlying_price": F, "open_interest": oi}


def test_greeks_match_finite_differences():
    T, K, iv, F = 30 / 365, 62000.0, 0.55, 60000.0
    g, va, ch, d = _greeks(1.0, T, K, iv, F)
    delta = lambda f=F, s=iv, t=T: norm.cdf((np.log(f / K) + 0.5 * s * s * t) / (s * np.sqrt(t)))
    h = F * 1e-4
    assert g == pytest.approx((delta(F + h) - delta(F - h)) / (2 * h), rel=1e-5)
    assert va == pytest.approx((delta(s=iv + 1e-5) - delta(s=iv - 1e-5)) / 2e-5, rel=1e-4)
    assert ch == pytest.approx((delta(t=T - 1 / 365 / 2) - delta(t=T + 1 / 365 / 2)), rel=1e-3)   # per day


def test_gex_is_dollar_delta_change_per_1pct():
    rows = [_row(60000, "C", 100.0)]
    rep = positioning_report(rows, NOW_MS, 60000.0)
    T = rep["expiries"][0]["days"] / 365
    sq = 0.5 * np.sqrt(T)
    d = lambda F: norm.cdf((np.log(F / 60000) + 0.5 * sq * sq) / sq)
    fd = (d(60000 * 1.005) - d(60000 * 0.995)) * 100 * 60000             # Δ$ change for a 1 % move
    assert rep["totals"]["gex"] == pytest.approx(fd, rel=1e-3)
    short = positioning_report(rows, NOW_MS, 60000.0, convention="short_all")
    assert short["totals"]["gex"] == pytest.approx(-rep["totals"]["gex"])


def test_max_pain_and_put_call():
    rows = [_row(50000, "P", 300), _row(55000, "P", 200), _row(60000, "C", 50), _row(65000, "C", 400),
            _row(70000, "C", 100)]
    rep = positioning_report(rows, NOW_MS, 60000.0)
    e = rep["expiries"][0]
    K = np.array([50000, 55000, 60000, 65000, 70000.0])
    pain = lambda x: 300 * max(50000 - x, 0) + 200 * max(55000 - x, 0) + 50 * max(x - 60000, 0) + \
        400 * max(x - 65000, 0) + 100 * max(x - 70000, 0)
    assert e["max_pain"] == K[np.argmin([pain(x) for x in K])]
    assert e["put_call"] == pytest.approx(500 / 550)


def test_flip_between_put_and_call_gamma():
    """Dealers short puts below and long calls above: GEX negative low, positive high → flip between."""
    rows = [_row(50000, "P", 1000), _row(70000, "C", 1000)]
    rep = positioning_report(rows, NOW_MS, 60000.0)
    assert rep["gamma_flip"] is not None and 50000 < rep["gamma_flip"] < 70000
    prof = np.array(rep["profile"]["gex"])
    assert prof[0] < 0 < prof[-1]
    assert rep["walls"]["call_wall"] == 70000 and rep["walls"]["put_wall"] == 50000


def test_endpoint(monkeypatch):
    rows, _ = deribit_book(spot=83000)
    monkeypatch.setattr(pos_router, "_book", lambda ccy: (rows, 83000.0, NOW_MS))
    r = client.get("/api/positioning/BTC")
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["n_options"] > 50 and len(js["expiries"]) >= 4 and len(js["profile"]["gex"]) == 121
    assert all(e["implied_move"] > 0 for e in js["expiries"])
    assert client.get("/api/positioning/XRP").status_code == 404
    assert client.get("/api/positioning/BTC?convention=nope").status_code == 422

    def boom(ccy):
        raise RuntimeError("offline")
    monkeypatch.setattr(pos_router, "_book", boom)
    assert client.get("/api/positioning/ETH").status_code == 503
