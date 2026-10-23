"""
tarf.py — TARF desk: target redemption forwards on FX, gold, silver and crypto priced under
flat vol, SSVI-Dupire local vol and Merton jumps; zero-cost strike, knock-out timing,
client tail risk and model-risk spread.
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.tarf import tarf_report
from .forex import PAIRS

router = APIRouter(prefix="/tarf", tags=["tarf"])

# Typical 3-6M 25Δ RR / BF when the trader has not loaded live quotes (vol points as decimals).
DEFAULT_SMILE = {"crypto": (-0.04, 0.015), "metal": (0.01, 0.004), "fx": (-0.006, 0.002)}


class TarfRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    sigma: float = Field(..., gt=0.01, lt=3, description="ATM vol")
    r_d: float = 0.04
    r_f: float = 0.0
    side: str = Field(default="buy", pattern="^(buy|sell)$")
    n_fix: int = Field(default=12, ge=2, le=52)
    freq_per_year: int = Field(default=12, ge=4, le=52)
    K: float | None = Field(default=None, gt=0, description="Blank = zero-cost strike")
    target_pct: float | None = Field(default=None, gt=0.05, lt=100, description="Target in % of spot")
    leverage: float = Field(default=2.0, ge=1, le=4)
    notional: float = Field(default=1.0, gt=0)
    target_type: str = Field(default="full", pattern="^(full|exact|none)$")
    rr25: float | None = Field(default=None, gt=-0.5, lt=0.5)
    bf25: float | None = Field(default=None, gt=-0.05, lt=0.5)
    jump_intensity: float = Field(default=3.0, ge=0.01, le=50)
    jump_mean: float | None = Field(default=None, gt=-0.5, lt=0.5)
    jump_sd: float = Field(default=0.05, ge=0.001, lt=0.5)
    n_paths: int = Field(default=15000, ge=2000, le=40000)


@router.post("/price")
def price(req: TarfRequest):
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    cls = PAIRS[pair]["asset_class"]
    smile_src = "quotes"
    rr, bf = req.rr25, req.bf25
    if rr is None or bf is None:
        rr, bf = DEFAULT_SMILE.get(cls, DEFAULT_SMILE["fx"])
        smile_src = "assumed"
    # Jumps against the client's favourable side by default (crash for a buyer, spike for a seller).
    jm = req.jump_mean if req.jump_mean is not None else (-0.04 if req.side == "buy" else 0.04)
    jump = {"lambda": req.jump_intensity, "mean": jm, "sd": req.jump_sd}
    try:
        rep = tarf_report(req.S, req.r_d, req.r_f, req.sigma, side=req.side, n_fix=req.n_fix,
                          freq_per_year=req.freq_per_year, K=req.K, target_pct=req.target_pct,
                          leverage=req.leverage, notional=req.notional, target_type=req.target_type,
                          rr25=rr, bf25=bf, jump=jump, n_paths=req.n_paths)
    except ValueError as e:
        raise HTTPException(422, f"Could not price this TARF: {e}")
    return _clean({"pair": pair, "asset_class": cls, "smile": {"rr25": rr, "bf25": bf, "source": smile_src},
                   "side": req.side, "leverage": req.leverage, "target_type": req.target_type, **rep})


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
