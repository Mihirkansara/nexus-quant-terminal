"""
exotics.py — Exotics & Structured Products desk: single barriers (continuous and
BGK discrete), touch ladders, smile-consistent digitals, Dual Currency Investment
(crypto "Dual Investment") fair-APR ladders and accumulators.
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.exotics import (accumulator_report, barrier_price, dci_quote, digital_prices,
                            gk_prob, gk_vanilla, touch_prices)
from ..core.vanna_volga import pillars, vv_vol
from .forex import PAIRS

router = APIRouter(prefix="/exotics", tags=["exotics"])

KINDS = [(cp, d, k) for cp in ("call", "put") for d in ("down", "up") for k in ("out", "in")]


class Market(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    T: float = Field(..., gt=0, le=3, description="Years")
    r_d: float = Field(default=0.04, ge=-0.05, le=0.5)
    r_f: float = Field(default=0.0, ge=-0.05, le=0.5)
    sigma: float = Field(..., gt=0.005, lt=3)


class BarrierRequest(Market):
    K: float = Field(..., gt=0)
    H_down: float = Field(..., gt=0)
    H_up: float = Field(..., gt=0)
    rebate: float = Field(default=0.0, ge=0)
    monitoring_per_year: int | None = Field(default=252, ge=1, le=100000)
    is_call: bool = True
    direction: str = Field(default="up", pattern="^(up|down)$")
    knock: str = Field(default="out", pattern="^(in|out)$")
    rr25: float | None = Field(default=None, gt=-1, lt=1)
    bf25: float | None = Field(default=None, gt=-0.5, lt=1)


class DciRequest(Market):
    side: str = Field(default="sell_high", pattern="^(sell_high|buy_low)$")
    strikes_pct: list[float] = Field(default=[90, 94, 97, 103, 106, 110], min_length=1, max_length=30)
    offered_apr: float | None = Field(default=None, ge=0, le=20, description="Platform APR (decimal) at strike_pct_offer")
    strike_pct_offer: float | None = Field(default=None, gt=10, lt=500)


class AccumulatorRequest(Market):
    ko_pct: float = Field(default=105.0, gt=100, lt=200)
    strike_pct: float | None = Field(default=None, gt=10, lt=200)
    qty: float = Field(default=1.0, gt=0)
    gearing: float = Field(default=2.0, ge=1, le=4)
    fixings_per_year: int = Field(default=252, ge=12, le=365)
    n_paths: int = Field(default=20000, ge=1000, le=60000)
    jump_intensity: float = Field(default=0.0, ge=0, le=100)
    jump_mean: float = Field(default=0.0, gt=-0.8, lt=0.5)
    jump_sd: float = Field(default=0.0, ge=0, lt=1)


def _check(pair):
    if pair.upper() not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")


def _smile_vol(req, K):
    """σ(K) and ∂σ/∂K from a vanna-volga smile when RR/BF are supplied, else flat."""
    if req.rr25 is None or req.bf25 is None:
        return req.sigma, 0.0
    pl = pillars(req.S, req.T, req.r_d, req.r_f, req.sigma, req.rr25, req.bf25)
    h = K * 1e-3
    v = float(vv_vol(K, req.S, req.T, req.r_d, req.r_f, pl))
    vu = float(vv_vol(K + h, req.S, req.T, req.r_d, req.r_f, pl))
    vd = float(vv_vol(K - h, req.S, req.T, req.r_d, req.r_f, pl))
    return v, (vu - vd) / (2 * h)


@router.post("/barrier")
def barrier_desk(req: BarrierRequest):
    """All eight single barriers, touches, digitals and the selected barrier's spot profile."""
    _check(req.pair)
    if not req.H_down < req.S < req.H_up:
        raise HTTPException(422, "Need H_down < spot < H_up.")
    a = (req.S, req.K)
    m = (req.T, req.r_d, req.r_f, req.sigma)
    rows = []
    for cp, d, k in KINDS:
        H = req.H_up if d == "up" else req.H_down
        cont = barrier_price(*a, H, *m, cp == "call", d, k, req.rebate)
        disc = barrier_price(*a, H, *m, cp == "call", d, k, req.rebate, req.monitoring_per_year)
        van = gk_vanilla(*a, *m, cp == "call")
        rows.append({"type": cp, "direction": d, "knock": k, "barrier": H, "continuous": cont,
                     "discrete": disc, "vanilla": float(van),
                     "pct_of_vanilla": float(disc / van * 100) if van > 1e-12 else None})

    # Spot profile of the selected barrier: price and delta through the barrier.
    H = req.H_up if req.direction == "up" else req.H_down
    lo, hi = min(req.H_down, req.K, req.S) * 0.9, max(req.H_up, req.K, req.S) * 1.1
    spots = np.linspace(lo, hi, 121)
    prof = [barrier_price(s, req.K, H, *m, req.is_call, req.direction, req.knock, req.rebate,
                          req.monitoring_per_year) for s in spots]
    van = [float(gk_vanilla(s, req.K, *m, req.is_call)) for s in spots]
    delta = np.gradient(prof, spots)

    touches = []
    for Hb in (req.H_down, req.H_up):
        t = touch_prices(req.S, Hb, req.T, req.r_d, req.r_f, req.sigma, 1.0, req.monitoring_per_year)
        t["barrier"] = Hb
        t["prob_finish_beyond"] = gk_prob(req.S, Hb, req.T, req.r_d, req.r_f, req.sigma, above=Hb > req.S)
        touches.append(t)

    # Touch ladder: hit probability vs barrier distance (in ATM-sd units).
    sd = req.sigma * np.sqrt(req.T)
    ladder = []
    for z in np.linspace(0.25, 3.0, 12):
        for sgn in (-1, 1):
            Hb = req.S * np.exp(sgn * z * sd)
            t = touch_prices(req.S, Hb, req.T, req.r_d, req.r_f, req.sigma, 1.0, req.monitoring_per_year)
            ladder.append({"barrier": float(Hb), "sd": float(sgn * z), "prob_touch": t["prob_touch"],
                           "one_touch": t["one_touch_at_expiry"]})
    ladder.sort(key=lambda r: r["barrier"])

    vol_k, slope = _smile_vol(req, req.K)
    dig = digital_prices(req.S, req.K, req.T, req.r_d, req.r_f, req.sigma, vol_k, slope)
    dig.update({"strike": req.K, "smile_vol": vol_k, "smile_slope_per_1pct": slope * req.K * 0.01})

    return _clean({"pair": req.pair.upper(), "rows": rows, "selected": {
        "type": "call" if req.is_call else "put", "direction": req.direction, "knock": req.knock,
        "barrier": H, "spots": spots.tolist(), "price": prof, "vanilla": van, "delta": delta.tolist()},
        "touches": touches, "touch_ladder": ladder, "digital": dig,
        "bgk_shift_pct": float((np.exp(0.5826 * req.sigma * np.sqrt(1 / req.monitoring_per_year)) - 1) * 100)
        if req.monitoring_per_year else 0.0})


@router.post("/dci")
def dci_ladder(req: DciRequest):
    """Fair APR / conversion-odds ladder for a Dual Currency Investment, plus offer audit."""
    _check(req.pair)
    out = []
    for p in sorted(req.strikes_pct):
        if (req.side == "sell_high") != (p > 100):
            continue                                   # DCIs are struck out-of-the-money
        q = dci_quote(req.S, req.S * p / 100, req.T, req.r_d, req.r_f, req.sigma, req.side)
        out.append({"strike_pct": p, "strike": req.S * p / 100, **q})
    if not out:
        raise HTTPException(422, "No out-of-the-money strikes for this side "
                                 "(sell_high needs strikes above 100%, buy_low below).")
    audit = None
    if req.offered_apr is not None and req.strike_pct_offer:
        audit = dci_quote(req.S, req.S * req.strike_pct_offer / 100, req.T, req.r_d, req.r_f,
                          req.sigma, req.side, req.offered_apr)
        audit["strike_pct"] = req.strike_pct_offer
        audit["vol_haircut"] = (req.sigma - audit["implied_vol_paid"]) if audit.get("implied_vol_paid") else None
    return _clean({"pair": req.pair.upper(), "side": req.side, "tenor_days": req.T * 365,
                   "ladder": out, "audit": audit})


@router.post("/accumulator")
def accumulator(req: AccumulatorRequest):
    """Zero-cost strike, KO odds and the client P&L distribution of a KO accumulator."""
    _check(req.pair)
    jump = None
    if req.jump_intensity > 0 and req.jump_sd > 0:
        jump = {"lambda": req.jump_intensity, "mean": req.jump_mean, "sd": req.jump_sd}
    try:
        rep = accumulator_report(req.S, req.T, req.r_d, req.r_f, req.sigma, req.ko_pct, req.strike_pct,
                                 req.qty, req.gearing, req.fixings_per_year, req.n_paths, jump=jump)
    except ValueError as e:
        raise HTTPException(422, f"No zero-cost strike: {e}")
    return _clean({"pair": req.pair.upper(), "spot": req.S, **rep})


def _clean(obj):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 8) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
