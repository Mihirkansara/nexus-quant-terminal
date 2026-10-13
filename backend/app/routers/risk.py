"""
risk.py — Risk Desk: full-revaluation VaR / ES (HS, filtered HS, delta-gamma
Cornish-Fisher, Student-t Monte Carlo), stressed window, Kupiec / Christoffersen
backtest, spot × vol ladder and Greek P&L explain for the portfolio's option book.
Factor history: spot from Deribit / yfinance and an implied-vol index (DVOL, GVZ,
VXSLV) where one is free, else an EWMA realised-vol proxy. All sources key-free.
"""

import time

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.risk_desk import (align_factors, backtest, book_greeks, ladder, risk_report,
                              stressed_window, worst_days)
from ..schemas import OptionLeg
from .forex import PAIRS

router = APIRouter(prefix="/risk", tags=["risk"])

VOL_INDEX = {"XAUUSD": ("yf", "^GVZ", "Cboe GVZ (gold ETF implied vol)"),
             "XAGUSD": ("yf", "^VXSLV", "Cboe VXSLV (silver ETF implied vol)"),
             "BTCUSD": ("deribit", "BTC", "Deribit DVOL"),
             "ETHUSD": ("deribit", "ETH", "Deribit DVOL")}


def _iv_history(pair):
    """(dates, levels, label) of the implied-vol index, or (None, None, None)."""
    from .vol import _DAY_MS, _cached, _deribit
    src = VOL_INDEX.get(pair)
    if not src:
        return None, None, None
    kind, sym, label = src

    def load():
        if kind == "deribit":
            from datetime import datetime, timezone
            now = int(time.time() * 1000)
            res = _deribit("get_volatility_index_data", currency=sym, start_timestamp=now - 1100 * _DAY_MS,
                           end_timestamp=now, resolution="1D")
            rows = res.get("data", [])
            return ([datetime.fromtimestamp(r[0] / 1000, tz=timezone.utc).date().isoformat() for r in rows],
                    [float(r[4]) for r in rows])
        import yfinance as yf
        h = yf.download(sym, period="4y", interval="1d", progress=False, auto_adjust=True)
        if h.empty:
            return None, None
        if hasattr(h.columns, "droplevel"):
            try:
                h.columns = h.columns.droplevel(1)
            except Exception:
                pass
        h = h["Close"].dropna()
        return [d.date().isoformat() for d in h.index], [float(v) for v in h]
    try:
        d, lv = _cached(f"ivhist:{pair}", 3600, load)
        if d and len(d) > 250:
            return d, lv, label
    except Exception:
        pass
    return None, None, None


def _factors(pair):
    from .eventvol import _load_history
    data = _load_history(pair)
    if not data or len(data["c"]) < 400:
        raise ValueError("not enough daily price history (need ~400 days)")
    d, lv, label = _iv_history(pair)
    fac = align_factors(data["dates"], data["c"], d, lv)
    fac["vol_label"] = label if fac["vol_source"] == "index" else "EWMA realised-vol proxy (×0.5)"
    return fac


class RiskRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    sigma: float = Field(..., gt=0.005, lt=5)
    r_d: float = 0.04
    r_f: float = 0.0
    options: list[OptionLeg] = Field(..., min_length=1, max_length=20)
    horizon: int = Field(default=1, ge=1, le=10, description="Trading days (crypto: calendar days)")


@router.post("/book")
def book_risk(req: RiskRequest):
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    ppy = PAIRS[pair]["periods_per_year"]
    legs = [o.model_dump() for o in req.options]
    try:
        fac = _factors(pair)
    except Exception as e:
        raise HTTPException(503, f"Risk-factor history unavailable: {e}")
    a = (legs, req.S, req.sigma, req.r_d, req.r_f)
    rep = risk_report(*a, fac, horizon=req.horizon, ppy=ppy)
    stressed, pnl1 = stressed_window(*a, fac, ppy=ppy)
    return _clean({
        "pair": pair, "factor": {"vol_source": fac["vol_source"], "vol_label": fac["vol_label"],
                                 "n_days": len(fac["r"]), "start": fac["dates"][0], "end": fac["dates"][-1]},
        **rep, "stressed": stressed,
        "worst_days": worst_days(*a, fac, pnl1, ppy=ppy),
        "backtest": backtest(*a, fac, pnl1, ppy=ppy),
        "ladder": ladder(*a),
    })


class ExplainRequest(BaseModel):
    S: float = Field(..., gt=0)
    sigma: float = Field(..., gt=0.005, lt=5)
    r_d: float = 0.04
    r_f: float = 0.0
    options: list[OptionLeg] = Field(..., min_length=1, max_length=20)
    spot_move_pct: float = Field(default=0.0, gt=-90, lt=500)
    vol_move_pts: float = Field(default=0.0, gt=-300, lt=500)
    days: float = Field(default=1.0, ge=0, le=60)


@router.post("/explain")
def explain(req: ExplainRequest):
    """Full-reval P&L of a what-if move and its Greek attribution."""
    from ..core.risk_desk import book_value, pnl_explain
    legs = [o.model_dump() for o in req.options]
    a = (legs, req.S, req.sigma, req.r_d, req.r_f)
    g = book_greeks(*a)
    S1, s1 = req.S * (1 + req.spot_move_pct / 100), max(req.sigma + req.vol_move_pts / 100, 0.01)
    full = float(book_value(legs, S1, s1, req.r_d, req.r_f, req.days / 365) - g["value"])
    return _clean({"greeks": g, "pnl": full,
                   "explain": pnl_explain(g, req.S, req.sigma, S1 - req.S, s1 - req.sigma, req.days, full)})


def _clean(obj):
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 6) if np.isfinite(x) else None
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
