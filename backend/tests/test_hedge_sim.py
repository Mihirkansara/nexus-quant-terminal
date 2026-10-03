"""Validation of the delta-hedging P&L lab against closed-form results.

Run from backend/:  python -m pytest tests -q
"""
import numpy as np
from fastapi.testclient import TestClient

from app.core.garman_kohlhagen import gk_price
from app.core.hedge_sim import gk_price_delta, hedge_report
from app.main import app
from app.routers import vol as vol_router

S0, RD, RF = 83000.0, 0.039, 0.0
ATM_CALL = [{"type": "call", "K": 83000, "T": 30 / 365, "qty": 1}]


def _run(**kw):
    args = dict(legs=ATM_CALL, S0=S0, sigma_i=0.40, sigma_r=0.40, r_d=RD, r_f=RF, ppy=365,
                n_paths=4000, sweep=False)
    args.update(kw)
    legs, s, si, sr, rd, rf, ppy = (args.pop(k) for k in
                                    ("legs", "S0", "sigma_i", "sigma_r", "r_d", "r_f", "ppy"))
    return hedge_report(legs, s, si, sr, rd, rf, ppy, **args)


def test_pricing_matches_gk_module_and_parity():
    for K in (70000, 83000, 95000):
        c, _ = gk_price_delta(np.array([S0]), K, 0.25, RD, 0.01, 0.4, True)
        p, _ = gk_price_delta(np.array([S0]), K, 0.25, RD, 0.01, 0.4, False)
        assert abs(c[0] - gk_price(S0, K, 0.25, RD, 0.01, 0.4, "call")) < 1e-8
        assert abs(c[0] - p[0] - (S0 * np.exp(-0.01 * 0.25) - K * np.exp(-RD * 0.25))) < 1e-6


def test_fair_vol_hedge_is_unbiased_with_derman_kamal_error():
    for spd in (1, 4):
        r = _run(steps_per_day=spd)
        se = r["pnl"]["std"] / np.sqrt(4000)
        assert abs(r["pnl"]["mean"]) < 4 * se
        assert abs(r["pnl"]["std"] / r["benchmarks"]["derman_kamal_sd"] - 1) < 0.1


def test_mean_pnl_tracks_theoretical_vol_edge():
    for sr in (0.30, 0.50):
        r = _run(sigma_r=sr, steps_per_day=4)
        edge = r["benchmarks"]["theoretical_edge"]
        assert abs(r["pnl"]["mean"] - edge) < 0.08 * abs(edge)


def test_frequency_sweep_trades_risk_for_costs():
    r = hedge_report(ATM_CALL, S0, 0.4, 0.4, RD, RF, 365, n_paths=1500, cost_bps=3)
    rows = r["frequency_sweep"]
    stds = [x["std"] for x in rows]
    costs = [x["cost"] for x in rows]
    assert all(a > b for a, b in zip(stds, stds[1:]))       # hedge more → less noise
    assert all(a < b for a, b in zip(costs, costs[1:]))     # …but more cost
    assert stds[0] / stds[2] > 1.6                           # ≈ √4 scaling


def test_band_rule_and_costs():
    t = _run(steps_per_day=4, cost_bps=5)
    b = _run(steps_per_day=4, cost_bps=5, rule="band", band=0.05)
    assert b["trades_per_path"] < t["trades_per_path"]
    assert -b["attribution"]["costs"] < -t["attribution"]["costs"]
    lel = t["benchmarks"]["leland_cost"]
    assert 0.5 * lel < -t["attribution"]["costs"] < 2 * lel


def test_gaps_and_jumps_fatten_the_tail():
    xag = [{"type": "call", "K": 64.5, "T": 21 / 252, "qty": 100}]
    base = _run(legs=xag, S0=64.5, r_d=0.039, r_f=0.02, ppy=252)
    gap = _run(legs=xag, S0=64.5, r_d=0.039, r_f=0.02, ppy=252, weekend_gap=0.02)
    assert gap["inputs"]["weekend_gaps"] >= 3 and gap["pnl"]["std"] > base["pnl"]["std"]
    assert _run()["inputs"]["weekend_gaps"] == 0              # crypto trades 24/7
    jump = _run(model="jump", jump={"lambda": 12, "mean": -0.01, "sd": 0.06})
    assert jump["pnl"]["es05"] < _run()["pnl"]["es05"]


def test_endpoint(monkeypatch):
    rng = np.random.default_rng(1)
    closes = list(83000 * np.exp(np.cumsum(rng.standard_t(3, 700) * 0.02)))
    monkeypatch.setattr(vol_router, "_crypto_closes", lambda ccy: closes)
    vol_router._cache.clear()
    c = TestClient(app)
    body = {"pair": "BTCUSD", "options": [{"type": "call", "K": 83000, "T": 0.0822, "qty": 1}],
            "S": 83000, "sigma_implied": 0.4, "sigma_realised": 0.45, "r_d": 0.039, "r_f": 0,
            "steps_per_day": 4, "cost_bps": 2, "n_paths": 1000}
    r = c.post("/api/hedge/simulate", json=body)
    assert r.status_code == 200
    d = r.json()
    assert d["inputs"]["periods_per_year"] == 365 and len(d["frequency_sweep"]) == 5
    assert d["benchmarks"]["theoretical_edge"] > 0 and len(d["histogram"]["counts"]) == 40
    assert c.post("/api/hedge/simulate", json={**body, "model": "bootstrap"}).status_code == 200
    assert c.post("/api/hedge/simulate", json={**body, "pair": "NOPE"}).status_code == 404
    assert c.post("/api/hedge/simulate", json={**body, "options": []}).status_code == 422
    assert c.post("/api/hedge/simulate", json={**body, "steps_per_day": 3}).status_code == 422
