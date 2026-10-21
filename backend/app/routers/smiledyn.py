"""
smiledyn.py — Smile Dynamics desk: SABR fits (live Deribit per expiry for BTC/ETH, or built
from ATM / 25Δ RR / BF quotes for any pair), smile-consistent hedge ratios (sticky strike,
sticky delta, SABR, Bartlett) and the empirical spot-vol beta from the implied-vol index.
"""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.smile_dynamics import (backbone, calibrate_sabr, classify_regime, empirical_beta,
                                   hedge_ratios, sabr_vol, strike_for_delta)
from ..core.vanna_volga import pillars, vv_vol
from .forex import PAIRS

router = APIRouter(prefix="/smiledyn", tags=["smiledyn"])

DELTAS = [(0.10, False, "10Δ put"), (0.25, False, "25Δ put"), (0.50, True, "ATM (50Δ)"),
          (0.25, True, "25Δ call"), (0.10, True, "10Δ call")]


def _empirical(pair):
    """Spot-vol beta from the vol index (DVOL / GVZ / VXSLV); None if unavailable."""
    try:
        from .eventvol import _load_history
        from .risk import _iv_history
        data = _load_history(pair)
        d, lv, label = _iv_history(pair)
        if not data or d is None:
            return None
        emp = empirical_beta(data["dates"], data["c"], d, lv)
        if emp:
            emp["index"] = label
        return emp
    except Exception:
        return None


def _expiry_report(F, T, strikes, vols, beta, label, days):
    p = calibrate_sabr(strikes, vols, F, T, beta)
    grid = F * np.exp(np.linspace(np.log(min(strikes) / F), np.log(max(strikes) / F), 60))
    rows = []
    for d, call, name in DELTAS:
        K = strike_for_delta(F, T, p, d, call)
        rows.append({"label": name, "call": call, **hedge_ratios(K, F, T, p, call)})
    return {"label": label, "days": days, "T": T, "forward": F, "params": p,
            "market": {"strikes": list(map(float, strikes)), "iv": list(map(float, vols))},
            "fit": {"strikes": grid.tolist(), "iv": sabr_vol(grid, F, T, p["alpha"], p["beta"], p["rho"], p["nu"]).tolist()},
            "deltas": rows, "backbone": backbone(F, T, p)}


@router.get("/crypto/{currency}")
def crypto(currency: str, beta: float = 1.0):
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Live SABR fits are available for BTC and ETH (Deribit).")
    if not 0 <= beta <= 1:
        raise HTTPException(422, "beta must be in [0, 1].")
    from .vol import get_crypto_vol
    try:
        surf = get_crypto_vol(currency)
    except HTTPException as e:
        raise HTTPException(503, f"Deribit surface unavailable: {e.detail}")
    exps = [e for e in surf["expiries"] if 2 <= e["days"] <= 200 and len(e["market"]["strikes"]) >= 5][:6]
    if not exps:
        raise HTTPException(503, "No Deribit expiries with enough quotes.")
    out = [_expiry_report(e["forward"], e["T"], e["market"]["strikes"], e["market"]["iv"], beta, e["label"], e["days"])
           for e in exps]
    emp = _empirical(f"{currency}USD")
    ref = min(out, key=lambda r: abs(r["days"] - 30))
    return _clean({"pair": f"{currency}USD", "source": "Deribit mark IVs (OTM) per expiry", "beta": beta,
                   "expiries": out, "reference": ref["label"], "empirical": emp,
                   "regime": classify_regime(ref["backbone"], emp["volpts_per_1pct_recent"] if emp else None),
                   "spot": surf.get("index_price")})


class QuoteRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    T: float = Field(default=0.25, gt=0.005, le=3)
    r_d: float = 0.04
    r_f: float = 0.0
    atm: float = Field(..., gt=0.005, lt=3)
    rr25: float = Field(default=0.0, gt=-0.5, lt=0.5)
    bf25: float = Field(default=0.003, ge=-0.05, lt=0.5)
    beta: float = Field(default=1.0, ge=0, le=1)


@router.post("/quotes")
def from_quotes(req: QuoteRequest):
    """SABR fitted to a vanna-volga smile built from ATM / RR / BF, for any pair."""
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    try:
        pl = pillars(req.S, req.T, req.r_d, req.r_f, req.atm, req.rr25, req.bf25)
    except ValueError as e:
        raise HTTPException(422, str(e))
    F = req.S * np.exp((req.r_d - req.r_f) * req.T)
    lo, hi = pl[0]["K"], pl[2]["K"]
    span = np.log(hi / lo)
    strikes = np.exp(np.linspace(np.log(lo) - 0.6 * span, np.log(hi) + 0.6 * span, 13))
    vols = vv_vol(strikes, req.S, req.T, req.r_d, req.r_f, pl)
    rep = _expiry_report(F, req.T, strikes, vols, req.beta, f"{req.T * 12:.1f}M", req.T * 365)
    emp = _empirical(pair)
    return _clean({"pair": pair, "source": "Vanna-volga smile from ATM / 25Δ RR / 25Δ BF quotes", "beta": req.beta,
                   "expiries": [rep], "reference": rep["label"], "empirical": emp,
                   "regime": classify_regime(rep["backbone"], emp["volpts_per_1pct_recent"] if emp else None),
                   "spot": req.S})


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
