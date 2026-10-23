"""AI Hedger: BPTT gradient check, P&L identities, learning beats BS delta under costs, endpoint."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.deep_hedge import (MLP, bs_call, cvar, deep_hedge_report, features, ntb_grad, ntb_positions,
                                 pnl, simulate, ww_positions)
from app.main import app

client = TestClient(app)


def test_ntb_bptt_gradient_matches_finite_differences():
    rng = np.random.default_rng(0)
    S = simulate(64, 10, 0.1, 0.5, rng)
    X, D, _, _ = features(S, 1.0, 0.1, 0.5, 10)
    p0 = float(bs_call(1.0, 1.0, 0.1, 0.5)[0])
    net = MLP([3, 8, 8, 2], np.random.default_rng(1), out_bias=-1.0, out_scale=1.0)
    w = -np.ones(64) / 64

    def f():
        return float((w * pnl(S, ntb_positions(net, X, D)[0], 1.0, 0.002, p0)[0]).sum())

    _, grads = ntb_grad(net, S, X, D, 1.0, 0.002, p0, w)
    for li, (i, j) in [(0, (0, 0)), (1, (2, 3)), (2, (4, 1)), (2, (5, 0))]:
        W, e = net.W[li], 1e-6
        old = W[i, j]
        W[i, j] = old + e
        fp = f()
        W[i, j] = old - e
        fm = f()
        W[i, j] = old
        assert grads[li][i, j] == pytest.approx((fp - fm) / (2 * e), rel=1e-5, abs=1e-12)


def test_pnl_identities():
    rng = np.random.default_rng(3)
    S = simulate(20000, 50, 0.25, 0.2, rng)
    assert S[:, -1].mean() == pytest.approx(1.0, abs=0.01)                       # martingale
    p0 = float(bs_call(1.0, 1.0, 0.25, 0.2)[0])
    _, D, G, tau = features(S, 1.0, 0.25, 0.2, 50)
    pl, to, tc = pnl(S, D, 1.0, 0.0, p0)
    assert abs(pl.mean()) < 0.002 and pl.std() < 0.2 * p0                        # discrete delta hedge ≈ replicates
    unhedged = pnl(S, np.zeros_like(D), 1.0, 0.0, p0)[0]
    assert unhedged.std() > 5 * pl.std()
    ww = ww_positions(D, G, S, 0.002, 1e13, tau)                                  # huge risk aversion → band → 0
    assert np.allclose(ww, D, atol=1e-3)
    assert pnl(S, D, 1.0, 0.002, p0)[2].mean() == pytest.approx(0.002 * (to * 1.0).mean(), rel=0.05)


def test_deep_hedgers_beat_bs_delta_under_costs():
    rep = deep_hedge_report(62000, 62000, 30 / 365, 0.6, cost_bps=20, n_steps=20, n_train=6000, n_test=6000,
                            iters=200)
    s = rep["strategies"]
    assert s["Deep NTB"]["cvar"] < s["BS delta"]["cvar"]
    assert s["Deep NTB"]["turnover"] < s["BS delta"]["turnover"]                  # learns to trade less
    assert s["No hedge"]["cvar"] > 5 * s["BS delta"]["cvar"]
    assert rep["training"]["ntb"][0] > np.mean(rep["training"]["ntb"][-20:])      # loss decreases
    for b in rep["bands"]:
        assert all(lo <= d <= hi for lo, d, hi in zip(b["ntb_lo"], b["delta"], b["ntb_hi"]))


def test_endpoint():
    body = {"pair": "XAUUSD", "S": 4400, "sigma": 0.2, "days": 20, "cost_bps": 15, "n_steps": 10,
            "test_regime": "jumps"}
    r = client.post("/api/deephedge/train", json=body)
    assert r.status_code == 200, r.text
    js = r.json()
    assert set(js["strategies"]) == {"No hedge", "BS delta", "Whalley-Wilmott", "Deep NTB", "Deep FF"}
    assert js["test_regime"]["jump"]["lambda"] == 12.0 and len(js["bands"]) == 3
    assert client.post("/api/deephedge/train", json={**body, "pair": "NOPE"}).status_code == 404
