"""
xasset.py — Cross-asset desk: correlation matrices and breaks, gold/silver ratio
analytics (OU, Engle-Granger, Kalman hedge ratio) and a Margrabe outperformance
option pricer. Free yfinance data, no keys.
"""

import time

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.xasset import correlation_report, gsr_report, margrabe, returns_frame

router = APIRouter(prefix="/xasset", tags=["xasset"])

UNIVERSE = {
    "XAUUSD": "GC=F", "XAGUSD": "SI=F", "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD",
    "EURUSD": "EURUSD=X", "DXY": "DX-Y.NYB", "US10Y": "^TNX", "WTI": "CL=F",
}
LEASE = {"XAUUSD": 0.003, "XAGUSD": 0.02}          # default lease rates (q) for metals
_cache: dict = {}


def _load_closes(period: str = "3y") -> pd.DataFrame:
    hist = yf.download(list(UNIVERSE.values()), period=period, interval="1d",
                       progress=False, auto_adjust=True, group_by="column")
    if hist is None or hist.empty:
        raise ValueError("no data returned")
    close = hist["Close"] if "Close" in hist.columns.get_level_values(0) else hist
    inv = {v: k for k, v in UNIVERSE.items()}
    close = close.rename(columns=inv)
    keep = [c for c in UNIVERSE if c in close.columns and close[c].notna().sum() > 300]
    if not {"XAUUSD", "XAGUSD"} <= set(keep):
        raise ValueError("gold/silver history unavailable")
    close = close[keep]
    close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
    return close.groupby(level=0).last().ffill(limit=3)


def _report():
    hit = _cache.get("report")
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    closes = _load_closes()
    rets = returns_frame(closes.dropna(how="any"))
    if len(rets) < 300:
        raise ValueError("not enough overlapping history")
    rep = {"correlations": correlation_report(rets),
           "gsr": gsr_report(closes["XAUUSD"], closes["XAGUSD"]),
           "spot": {c: float(closes[c].dropna().iloc[-1]) for c in closes.columns},
           "lease_defaults": LEASE}
    _cache["report"] = (time.time(), _clean(rep))
    return _cache["report"][1]


def _clean(obj):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 6) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    return obj


@router.get("")
def get_cross_asset():
    """Correlation desk + gold/silver ratio analytics (cached 30 min)."""
    try:
        return _report()
    except Exception as e:
        _cache.pop("report", None)
        raise HTTPException(503, f"Cross-asset data unavailable: {e}")


class MargrabeRequest(BaseModel):
    S1: float = Field(..., gt=0, description="Spot of the asset received (outperformer)")
    S2: float = Field(..., gt=0, description="Spot of the asset delivered")
    notional: float = Field(default=1_000_000, gt=0, description="Notional in USD per leg at inception")
    sigma1: float = Field(..., gt=0, lt=5)
    sigma2: float = Field(..., gt=0, lt=5)
    rho: float = Field(..., ge=-0.999, le=0.999)
    T: float = Field(..., gt=0, le=10)
    q1: float = Field(default=0.0, gt=-1, lt=1, description="Yield / lease rate of asset 1")
    q2: float = Field(default=0.0, gt=-1, lt=1, description="Yield / lease rate of asset 2")
    strike_pct: float = Field(default=100.0, gt=0, lt=1000,
                              description="Asset-2 leg size as % of notional (100 = at-the-money outperformance)")


@router.post("/margrabe")
def price_margrabe(req: MargrabeRequest):
    """Outperformance option: pays max(N·S1(T)/S1(0) − k·N·S2(T)/S2(0), 0)."""
    n1 = req.notional / req.S1
    n2 = req.notional * req.strike_pct / 100 / req.S2
    res = margrabe(req.S1, req.S2, n1, n2, req.sigma1, req.sigma2, req.rho, req.T, req.q1, req.q2)
    grid = np.linspace(-0.95, 0.95, 39)
    curve = [margrabe(req.S1, req.S2, n1, n2, req.sigma1, req.sigma2, r, req.T, req.q1, req.q2)["price"]
             for r in grid]
    return _clean({**res, "price_pct": res["price"] / req.notional * 100, "n1": n1, "n2": n2,
                   "rho_grid": grid.tolist(), "price_vs_rho": curve})
