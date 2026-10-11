"""Event & weekend vol: vol time, exact recovery of planted parameters, realised study, endpoints."""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.event_vol import (FOMC_PAST, default_events, et_to_utc, fit_term_structure,
                                forward_vols, is_weekend, model_vol, realised_study, vol_time)
from app.main import app
from app.routers import eventvol as ev_router
from app.routers import news as news_router
from app.routers import vol as vol_router

NOW = datetime(2026, 10, 11, 5, 0, tzinfo=timezone.utc)          # a Sunday
client = TestClient(app)


def test_calendar_and_dst():
    assert et_to_utc("2026-10-28", 14).hour == 18                 # EDT
    assert et_to_utc("2026-12-09", 14).hour == 19                 # EST
    evs = default_events(NOW, 60)
    assert [e["type"] for e in evs][:3] == ["CPI", "FOMC", "NFP"]
    assert is_weekend(datetime(2026, 10, 9, 22, tzinfo=timezone.utc), "fx")       # Fri 22:00 FX closed
    assert not is_weekend(datetime(2026, 10, 9, 22, tzinfo=timezone.utc), "crypto")


def test_vol_time_limits():
    end = NOW + timedelta(days=28)                                 # 4 whole weeks
    tau1, wk, we = vol_time(NOW, end, 1.0, "crypto")
    assert tau1 == pytest.approx(28 / 365) and we == pytest.approx(8 / 365)
    tau0, _, _ = vol_time(NOW, end, 0.0, "fx")
    assert tau0 == pytest.approx(20 / 365, abs=1e-9)               # 20 weekdays of FX trading


@pytest.mark.parametrize("market,base,w,moves", [
    ("crypto", 0.42, 0.65, {"FOMC": 0.035, "CPI": 0.025, "NFP": 0.02}),
    ("fx", 0.16, 0.15, {"FOMC": 0.012, "CPI": 0.010, "NFP": 0.008}),
])
def test_fit_recovers_planted_parameters(market, base, w, moves):
    evs = default_events(NOW, 120)
    ev_var = {k: v ** 2 for k, v in moves.items()}
    exps = []
    for d in [1, 2, 3, 4, 5, 6, 7, 12, 19, 26, 33, 47, 54, 82]:
        t = (NOW + timedelta(days=d)).replace(hour=8)
        exps.append({"time": t, "atm_vol": model_vol(NOW, t, base, w, evs, ev_var, market)["vol"]})
    f = fit_term_structure(NOW, exps, evs, market)
    assert f["base_vol"] == pytest.approx(base, rel=1e-6)
    assert f["weekend_weight"] == pytest.approx(w)
    for k, v in moves.items():
        assert np.sqrt(f["event_variance"][k]) == pytest.approx(v, rel=1e-5)
        assert f["identified"][k]
    assert f["rmse_vol"] < 1e-8


def test_event_variance_is_additive_and_forward_arbitrage():
    evs = default_events(NOW, 30)
    end = et_to_utc("2026-10-15", 10)                              # just after CPI
    a = model_vol(NOW, end, 0.2, 0.2, evs, {}, "fx")
    b = model_vol(NOW, end, 0.2, 0.2, evs, {"CPI": 0.01 ** 2}, "fx")
    assert b["vol"] ** 2 * b["T"] - a["vol"] ** 2 * a["T"] == pytest.approx(1e-4)
    assert forward_vols([(0.1, 0.30), (0.2, 0.20)])[0]["arbitrage"]          # total variance falls
    assert not forward_vols([(0.1, 0.20), (0.2, 0.20)])[0]["arbitrage"]


def test_realised_study_recovers_weekend_weight():
    rng = np.random.default_rng(7)
    d, dates, c = datetime(2018, 1, 1), [], [100.0]
    dates.append(d)
    while len(dates) < 2200:
        d += timedelta(days=1)
        if d.weekday() >= 5:
            continue
        var = 0.01 ** 2 * (1 + (2 * 0.3 if d.weekday() == 0 else 0))
        c.append(c[-1] * np.exp(rng.normal(0, np.sqrt(var))))
        dates.append(d)
    rs = realised_study([x.isoformat() for x in dates], c, "fx", fomc_dates=[])
    assert rs["weekend_weight"] == pytest.approx(0.3, abs=0.07)
    assert rs["weekday_vol_ann"] == pytest.approx(0.01 * np.sqrt(365), rel=0.05)


def test_realised_fomc_lump():
    rng = np.random.default_rng(3)
    d, dates, c = datetime(2024, 1, 1), [datetime(2024, 1, 1)], [100.0]
    fomc = {datetime.fromisoformat(x).date() for x in FOMC_PAST}
    while d < datetime(2025, 12, 31):
        d += timedelta(days=1)
        lump = 0.03 ** 2 if d.date() in fomc else 0.0
        c.append(c[-1] * np.exp(rng.normal(0, np.sqrt(0.005 ** 2 + lump))))
        dates.append(d)
    rs = realised_study([x.isoformat() for x in dates], c, "crypto", fomc_dates=FOMC_PAST)
    assert rs["fomc"]["n"] == 16
    assert rs["fomc"]["event_sd_pct"] == pytest.approx(3.0, abs=0.9)
    assert rs["weekend_weight"] == pytest.approx(1.0, abs=0.25)


@pytest.fixture
def offline(monkeypatch):
    monkeypatch.setattr(ev_router, "_now", lambda: NOW)
    monkeypatch.setattr(news_router, "_load_calendar", lambda: (_ for _ in ()).throw(RuntimeError("offline")))


def test_crypto_endpoint(monkeypatch, offline):
    evs = default_events(NOW, 200)
    ev_var = {"FOMC": 0.03 ** 2, "CPI": 0.02 ** 2, "NFP": 0.015 ** 2}
    rows = []
    for d in [1, 2, 3, 5, 12, 19, 26, 54, 82, 173]:
        t = (NOW + timedelta(days=d)).replace(hour=8)
        rows.append({"expiry": t.strftime("%Y-%m-%d"), "label": t.strftime("%d%b%y").upper(), "days": d,
                     "atm_vol": model_vol(NOW, t, 0.45, 0.7, evs, ev_var, "crypto")["vol"]})
    monkeypatch.setattr(vol_router, "get_crypto_vol", lambda ccy: {"expiries": rows, "index_price": 62000.0})
    r = client.get("/api/eventvol/crypto/BTC")
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["fit"]["base_vol"] == pytest.approx(0.45, rel=1e-4)
    assert js["moves"]["FOMC"]["event_sd_pct"] == pytest.approx(3.0, rel=1e-3)
    assert len(js["curve"]) >= 85 and len(js["tenors"]) == 6
    assert client.get("/api/eventvol/crypto/XRP").status_code == 404


def test_model_endpoint(offline):
    base = {"pair": "XAUUSD", "S": 4400, "base_vol": 0.18, "weekend_weight": 0.15,
            "event_moves_pct": {"FOMC": 1.4, "CPI": 1.1, "NFP": 1.0}, "expiry_days": 4}
    r = client.post("/api/eventvol/model", json=base)
    assert r.status_code == 200, r.text
    js = r.json()
    assert js["calculator"]["share"]["events"] > 0.15                     # 4-day option spans CPI
    on = js["tenors"][0]
    assert on["tenor"] == "O/N" and on["vol"] > 0
    # Fit mode: three quotes → event lumps held at the stated moves, base vol solved.
    q = client.post("/api/eventvol/model", json={**base, "quotes": [{"days": 7, "vol": 0.21},
                    {"days": 30, "vol": 0.20}, {"days": 91, "vol": 0.19}]})
    assert q.status_code == 200 and q.json()["fit"]["events_fixed"] is True
    assert q.json()["moves"]["FOMC"]["event_sd_pct"] == pytest.approx(1.4)
    # Dense quotes + fit_events frees the lumps.
    dense = [{"days": d, "vol": 0.2} for d in (1, 2, 3, 4, 5, 7, 14, 21, 30, 61, 91)]
    q2 = client.post("/api/eventvol/model", json={**base, "quotes": dense, "fit_events": True})
    assert q2.status_code == 200 and q2.json()["fit"]["events_fixed"] is False
    assert client.post("/api/eventvol/model", json={**base, "pair": "NOPE"}).status_code == 404
