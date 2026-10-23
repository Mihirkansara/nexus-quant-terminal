"""
deephedge.py — AI Hedger: trains a No-Transaction-Band deep-hedging network and a
feed-forward deep hedge (numpy, no API keys, no GPU) for a short call on any pair, and
compares them with BS delta and Whalley-Wilmott out of sample, optionally under a shifted
test regime (vol shock or jumps).
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.deep_hedge import deep_hedge_report
from .forex import PAIRS

router = APIRouter(prefix="/deephedge", tags=["deephedge"])
_cache: dict = {}


class Jump(BaseModel):
    intensity: float = Field(default=0.0, ge=0, le=100, description="Jumps per year")
    mean: float = Field(default=0.0, gt=-0.5, lt=0.5, description="Mean log jump")
    sd: float = Field(default=0.0, ge=0, lt=0.5)


class DeepHedgeRequest(BaseModel):
    pair: str = "BTCUSD"
    S: float = Field(..., gt=0)
    strike_pct: float = Field(default=100.0, gt=50, lt=200)
    days: float = Field(default=30.0, ge=2, le=180)
    sigma: float = Field(..., gt=0.02, lt=2.5)
    cost_bps: float = Field(default=10.0, ge=0, le=200, description="Proportional cost per trade")
    n_steps: int = Field(default=30, ge=5, le=60)
    alpha: float = Field(default=0.95, ge=0.5, le=0.995)
    jump: Jump = Jump()
    test_regime: str = Field(default="same", pattern="^(same|vol_up|jumps)$")


@router.post("/train")
def train(req: DeepHedgeRequest):
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    key = req.model_dump_json()
    if key in _cache:
        return _cache[key]
    jump = {"lambda": req.jump.intensity, "mean": req.jump.mean, "sd": req.jump.sd} if req.jump.intensity > 0 else None
    test_jump, test_sigma = "same", None
    if req.test_regime == "vol_up":
        test_sigma = req.sigma * 1.5
    elif req.test_regime == "jumps":
        test_jump = {"lambda": 12.0, "mean": -0.05, "sd": 0.06}
    T = req.days / 365
    rep = deep_hedge_report(req.S, req.S * req.strike_pct / 100, T, req.sigma, req.cost_bps, req.n_steps,
                            req.alpha, jump=jump, test_jump=test_jump, test_sigma=test_sigma)
    out = _clean({"pair": pair, "strike": req.S * req.strike_pct / 100, "days": req.days,
                  "test_regime_label": {"same": "Same as training", "vol_up": "Vol +50%",
                                        "jumps": "Crash jumps (12/yr, −5%)"}[req.test_regime], **rep})
    if len(_cache) > 32:
        _cache.clear()
    _cache[key] = out
    return out


def _clean(obj):
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 8) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
