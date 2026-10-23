"""
margin.py — Margin Desk: SPAN-style (CME) and portfolio-margin-style (Deribit) requirements for
the portfolio option book, margin-hike shocks, liquidation price ladder and Monte-Carlo
margin-call / liquidation probabilities.
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.margin import liquidation_ladder, margin_call_sim, pm_margin, span_margin
from ..schemas import OptionLeg
from .forex import PAIRS

router = APIRouter(prefix="/margin", tags=["margin"])

# Default price scan ranges (% of notional): CME % margins (COMEX gold 5 %, silver 10 % after May 2026),
# CME FX futures ≈ 2–3 %, CME bitcoin / ether futures ≈ 25–30 %.
DEFAULT_PSR = {"XAUUSD": 5.0, "XAGUSD": 10.0, "BTCUSD": 25.0, "ETHUSD": 30.0}
DEFAULT_VSR = {"metal": 4.0, "crypto": 15.0, "fx": 2.0}


class MarginRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    sigma: float = Field(..., gt=0.01, lt=3)
    r_d: float = 0.04
    r_f: float = 0.0
    options: list[OptionLeg] = Field(default=[], max_length=20)
    hedge_units: float = Field(default=0.0, description="Spot / perp / futures units held against the options")
    psr_pct: float | None = Field(default=None, gt=0.1, lt=100)
    vsr_pts: float | None = Field(default=None, ge=0, lt=100)
    hike_pct: float = Field(default=50.0, ge=0, le=300, description="Margin-hike shock on the scan ranges")
    equity: float | None = Field(default=None, gt=0, description="Account equity; default 1.5× initial")
    method: str | None = Field(default=None, pattern="^(span|pm)$")
    days: int = Field(default=10, ge=1, le=60)
    jump_intensity: float = Field(default=0.0, ge=0, le=100)
    jump_mean: float = Field(default=0.0, gt=-0.5, lt=0.5)
    jump_sd: float = Field(default=0.0, ge=0, lt=0.5)
    spot_vol_beta: float = Field(default=-0.5, ge=-5, le=5)


@router.post("/book")
def margin_book(req: MarginRequest):
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    if not req.options and abs(req.hedge_units) < 1e-12:
        raise HTTPException(422, "The book is empty: add option legs or a hedge.")
    cls = PAIRS[pair]["asset_class"]
    legs = [o.model_dump() for o in req.options]
    psr = req.psr_pct or DEFAULT_PSR.get(pair, 3.0)
    vsr = req.vsr_pts if req.vsr_pts is not None else DEFAULT_VSR.get(cls, 3.0)
    a = (legs, req.S, req.sigma, req.r_d, req.r_f)
    span = span_margin(*a, psr, vsr, req.hedge_units)
    span_hiked = span_margin(*a, psr * (1 + req.hike_pct / 100), vsr * (1 + req.hike_pct / 100), req.hedge_units)
    pm = pm_margin(*a, req.hedge_units)
    pm_hiked = pm_margin(*a, req.hedge_units, max_move_pct=16 * (1 + req.hike_pct / 100))
    method = req.method or ("pm" if cls == "crypto" else "span")
    initial = pm["initial"] if method == "pm" else span["requirement"]
    maint = pm["maintenance"] if method == "pm" else span["requirement"]
    equity = req.equity or 1.5 * initial
    params = {"psr_pct": psr, "vsr_pts": vsr}
    jump = {"lambda": req.jump_intensity, "mean": req.jump_mean, "sd": req.jump_sd} if req.jump_intensity > 0 else None
    ppy = PAIRS[pair]["periods_per_year"]
    sim = margin_call_sim(*a, equity, method, params, req.hedge_units, days=req.days, spot_vol_beta=req.spot_vol_beta,
                          jump=jump, ppy=ppy)
    ladder = liquidation_ladder(*a, equity, method, params, req.hedge_units)
    hiked_req = pm_hiked["maintenance"] if method == "pm" else span_hiked["requirement"]
    return _clean({
        "pair": pair, "method": method, "psr_pct": psr, "vsr_pts": vsr, "equity": equity,
        "initial": initial, "maintenance": maint, "excess": equity - maint,
        "span": span, "pm": pm,
        "hike": {"pct": req.hike_pct, "span": span_hiked["requirement"], "pm_initial": pm_hiked["initial"],
                 "requirement": hiked_req, "cash_call": max(hiked_req - equity, 0.0),
                 "excess_after": equity - hiked_req},
        "simulation": sim, "ladder": ladder,
    })


def _clean(obj):
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 6) if np.isfinite(x) else None
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
