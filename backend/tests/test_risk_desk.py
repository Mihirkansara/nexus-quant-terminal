"""Risk Desk: Greeks vs closed forms, VaR/ES vs theory, FHS regime scaling, backtest LRs, endpoints."""

from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import norm

from app.core.risk_desk import (align_factors, backtest, book_greeks, book_value, ladder, pnl_explain,
                                risk_report, stressed_window, var_es)
from app.main import app
from app.routers import eventvol as ev_router
from app.routers import risk as risk_router

S, SIG, RD, RF = 4400.0, 0.18, 0.0525, 0.0
CALL = [{"type": "call", "K": 4400, "T": 0.25, "qty": 1}]
FWD = [{"type": "call", "K": 4400, "T": 0.25, "qty": 1}, {"type": "put", "K": 4400, "T": 0.25, "qty": -1}]
client = TestClient(app)


def _history(n=1500, s=0.01, seed=1, regime=None):
    rng = np.random.default_rng(seed)
    sd = np.full(n, s) if regime is None else regime
    dates = [(date(2020, 1, 1) + timedelta(days=i)).isoformat() for i in range(n + 1)]
    c = S * np.exp(np.r_[0, np.cumsum(rng.normal(0, 1, n) * sd)])
    return dates, c / c[-1] * S


def test_greeks_match_garman_kohlhagen():
    g = book_greeks(CALL, S, SIG, RD, RF)
    T, sq = 0.25, SIG * 0.5
    d1 = (RD - RF + 0.5 * SIG ** 2) * T / sq
    d2 = d1 - sq
    assert g["delta"] == pytest.approx(norm.cdf(d1), rel=1e-4)
    assert g["gamma"] == pytest.approx(norm.pdf(d1) / (S * sq), rel=1e-4)
    assert g["vega"] == pytest.approx(S * norm.pdf(d1) * np.sqrt(T), rel=1e-5)
    assert g["vanna"] == pytest.approx(-norm.pdf(d1) * d2 / SIG, rel=1e-3)
    assert g["volga"] == pytest.approx(S * norm.pdf(d1) * np.sqrt(T) * d1 * d2 / SIG, rel=1e-3)
    f = book_greeks(FWD, S, SIG, RD, RF)                                   # put-call parity → forward
    assert f["delta"] == pytest.approx(np.exp(-RF * 0.25)) and abs(f["gamma"]) < 1e-6 and abs(f["vega"]) < 1e-6


def test_explain_is_exact_for_small_moves_and_sums():
    g = book_greeks(CALL, S, SIG, RD, RF)
    dS, ds = S * 0.004, 0.002
    full = float(book_value(CALL, S + dS, SIG + ds, RD, RF, 1 / 365) - g["value"])
    e = pnl_explain(g, S, SIG, dS, ds, 1, full)
    assert sum(e.values()) == pytest.approx(full)
    assert abs(e["unexplained"]) < 0.01 * abs(full)


def test_linear_book_var_matches_theory():
    dates, c = _history()
    fac = align_factors(dates, c)
    fac["dlv"] = np.zeros_like(fac["r"])
    rep = risk_report(FWD, S, SIG, RD, RF, fac)
    sd = np.std(fac["r"]) * S                                             # forward delta ≈ 1
    for m in ("HS", "FHS", "Delta-gamma CF", "Delta-normal"):
        assert rep["methods"][m]["var_990"] == pytest.approx(2.326 * sd, rel=0.12), m
    assert rep["methods"]["MC Student-t"]["var_990"] > rep["methods"]["Delta-normal"]["var_990"]   # fat tails
    assert rep["methods"]["HS"]["es_975"] == pytest.approx(sd * norm.pdf(1.96) / 0.025, rel=0.12)


def test_short_gamma_has_fatter_loss_tail_than_long():
    dates, c = _history(seed=4)
    fac = align_factors(dates, c)
    short = [{**CALL[0], "qty": -1}, {"type": "put", "K": 4400, "T": 0.25, "qty": -1}]
    long_ = [{**l, "qty": 1} for l in short]
    rs, rl = (risk_report(b, S, SIG, RD, RF, fac)["methods"]["HS"]["es_975"] for b in (short, long_))
    assert rs > rl
    assert risk_report(short, S, SIG, RD, RF, fac)["methods"]["Delta-gamma CF"]["skew"] < 0


def test_fhs_reacts_to_regime_and_stressed_window():
    n = 1500
    regime = np.r_[np.full(500, 0.01), np.full(250, 0.03), np.full(n - 750, 0.01)]
    dates, c = _history(n=n, regime=regime, seed=9)
    fac = align_factors(dates, c)
    rep = risk_report(FWD, S, SIG, RD, RF, fac)
    assert rep["methods"]["FHS"]["var_990"] < rep["methods"]["HS"]["var_990"]     # calm now, HS remembers the storm
    st, _ = stressed_window(FWD, S, SIG, RD, RF, fac)
    assert "2021-03-26" <= st["start"] <= "2021-07-04"                             # window covering the storm (days 500-750)


def test_backtest_calibrated_and_zones():
    dates, c = _history(n=1200, seed=2)
    fac = align_factors(dates, c)
    _, pnl = stressed_window(FWD, S, SIG, RD, RF, fac)
    bt = backtest(FWD, S, SIG, RD, RF, fac, pnl)
    assert bt["n"] == 500 and bt["exceptions"] <= 15 and bt["kupiec_p"] > 0.01
    assert bt["traffic_light"] in ("green", "amber")
    assert var_es(np.arange(-500, 500.0))["var_990"] == pytest.approx(490, abs=1)


def test_ladder_zero_at_origin():
    lad = ladder(CALL, S, SIG, RD, RF)
    i, j = lad["vol_pts"].index(0), lad["spot_pct"].index(0)
    assert lad["pnl"][i][j] == pytest.approx(0, abs=1e-9)
    assert lad["pnl"][i][-1] > 0 and lad["pnl"][-1][j] > 0                       # long call: up spot / up vol


def test_endpoints(monkeypatch):
    dates, c = _history()
    monkeypatch.setattr(ev_router, "_load_history", lambda pair: {"dates": dates, "c": c})
    ivd = dates[1:]
    rng = np.random.default_rng(3)
    iv = 25 * np.exp(np.cumsum(rng.normal(0, 0.04, len(ivd))))
    monkeypatch.setattr(risk_router, "_iv_history", lambda pair: (ivd, iv.tolist(), "test index"))
    body = {"pair": "XAUUSD", "S": S, "sigma": SIG, "r_d": RD, "r_f": RF,
            "options": [{"type": "call", "K": 4400, "T": 0.25, "qty": -1}, {"type": "put", "K": 4200, "T": 0.25, "qty": -1}]}
    r = client.post("/api/risk/book", json=body)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["factor"]["vol_source"] == "index" and set(js["methods"]) >= {"HS", "FHS", "MC Student-t"}
    assert js["backtest"]["n"] > 100 and len(js["worst_days"]) == 8 and js["stressed"]["es_975"] > 0
    r10 = client.post("/api/risk/book", json={**body, "horizon": 10}).json()
    assert r10["methods"]["HS"]["var_990"] > js["methods"]["HS"]["var_990"]
    e = client.post("/api/risk/explain", json={**body, "spot_move_pct": -5, "vol_move_pts": 6, "days": 1}).json()
    assert e["pnl"] < 0 and sum(e["explain"].values()) == pytest.approx(e["pnl"], abs=1e-4)
    monkeypatch.setattr(ev_router, "_load_history", lambda pair: None)
    assert client.post("/api/risk/book", json=body).status_code == 503
    assert client.post("/api/risk/book", json={**body, "pair": "NOPE"}).status_code == 404
