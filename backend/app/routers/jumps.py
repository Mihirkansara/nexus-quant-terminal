"""
jumps.py — Jump-diffusion lab: Merton and Bates calibrated to the live Deribit
BTC/ETH surface (via the Vol Lab feed), plus a manual Merton pricer for metals/FX
event and gap risk.
"""

import time

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.jump_models import (calibrate, density_report, jump_stats, merton_price,
                                implied_vol, model_smile)
from .forex import PAIRS

router = APIRouter(prefix="/jumps", tags=["jumps"])
_cache: dict = {}


def _surface_expiries(currency):
    from .vol import get_crypto_vol           # reuses the cached Deribit fetch + SVI parse
    surf = get_crypto_vol(currency)
    exps = [e for e in surf["expiries"] if 3 <= e["days"] <= 370 and len(e["market"]["strikes"]) >= 5]
    if len(exps) < 2:
        raise ValueError("not enough Deribit expiries to calibrate")
    return surf, exps


def calibration_report(exps, index_price=None):
    data = [{"T": e["T"], "forward": e["forward"], "strikes": e["market"]["strikes"],
             "iv": e["market"]["iv"], "label": e["label"], "days": e["days"]} for e in exps]
    fits = {m: calibrate(data, m) for m in ("merton", "bates")}
    smiles = []
    for d, rm, rb in zip(data, fits["merton"]["per_expiry"], fits["bates"]["per_expiry"]):
        F, T = d["forward"], d["T"]
        K = np.asarray(d["strikes"], float)
        grid = np.exp(np.linspace(np.log(K.min()), np.log(K.max()), 40))
        smiles.append({
            "label": d["label"], "days": d["days"], "T": T, "forward": F,
            "market": {"strikes": d["strikes"], "iv": d["iv"]},
            "grid": grid.tolist(),
            "merton": model_smile("merton", fits["merton"]["params"], F, T, grid).tolist(),
            "bates": model_smile("bates", fits["bates"]["params"], F, T, grid).tolist(),
            "rmse_merton": rm["rmse_vol"], "rmse_bates": rb["rmse_vol"],
        })
    F30 = min(data, key=lambda d: abs(d["days"] - 30))["forward"]
    return {
        "index_price": index_price,
        "fits": {m: {k: v for k, v in f.items() if k != "per_expiry"} for m, f in fits.items()},
        "stats": {m: jump_stats(fits[m]["params"], model=m) for m in fits},
        "density_30d": density_report(fits["bates"]["params"], "bates", 30 / 365, F30),
        "smiles": smiles,
    }


@router.get("/calibrate/{currency}")
def calibrate_crypto(currency: str):
    """Merton + Bates calibrated to the live Deribit smile for BTC or ETH (cached 30 min)."""
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Calibration is available for BTC and ETH (Deribit).")
    hit = _cache.get(currency)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    try:
        surf, exps = _surface_expiries(currency)
        rep = {"currency": currency, **_clean(calibration_report(exps, surf.get("index_price")))}
    except HTTPException as e:
        raise HTTPException(503, f"Deribit surface unavailable: {e.detail}")
    except Exception as e:
        raise HTTPException(503, f"Calibration failed: {e}")
    _cache[currency] = (time.time(), rep)
    return rep


class MertonRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    T: float = Field(..., gt=0, le=3)
    r_d: float = 0.039
    r_f: float = 0.0
    sigma: float = Field(..., gt=0.005, lt=3, description="Diffusion vol")
    jump_intensity: float = Field(default=2.0, ge=0, le=100, description="Jumps per year")
    jump_mean: float = Field(default=-0.03, gt=-0.8, lt=0.5, description="Mean log jump")
    jump_sd: float = Field(default=0.04, ge=0.001, lt=1, description="Log jump sd")


@router.post("/merton")
def merton_smile(req: MertonRequest):
    """Merton smile, jump statistics and 30-day density for any pair (manual parameters)."""
    if req.pair.upper() not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{req.pair}'.")
    F = req.S * np.exp((req.r_d - req.r_f) * req.T)
    params = {"sigma": req.sigma, "lambda": req.jump_intensity, "mu_j": req.jump_mean, "delta": req.jump_sd}
    tot = np.sqrt(req.sigma ** 2 + req.jump_intensity * (req.jump_mean ** 2 + req.jump_sd ** 2))
    K = F * np.exp(np.linspace(-2.5, 2.5, 41) * tot * np.sqrt(req.T))
    iv = model_smile("merton", params, F, req.T, K)
    atm = float(implied_vol(merton_price(F, [F], req.T, req.sigma, req.jump_intensity,
                                         req.jump_mean, req.jump_sd), F, [F], req.T)[0])
    # 25-delta-ish wings at ±0.674 sd for a quick RR / BF read.
    kp, kc = F * np.exp(-0.674 * tot * np.sqrt(req.T)), F * np.exp(0.674 * tot * np.sqrt(req.T))
    vp, vc = model_smile("merton", params, F, req.T, [kp, kc])
    return _clean({"pair": req.pair.upper(), "forward": F, "strikes": K.tolist(), "iv": iv.tolist(),
                   "atm_vol": atm, "total_vol": float(tot), "rr_approx": float(vc - vp),
                   "bf_approx": float(0.5 * (vc + vp) - atm),
                   "stats": jump_stats(params, T=min(req.T, 30 / 365), model="merton"),
                   "density": density_report(params, "merton", req.T, F)})


def _clean(obj):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 6) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
