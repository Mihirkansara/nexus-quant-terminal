"""forex.py — Live forex data and quant signal endpoints via yfinance."""

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.quant_analysis import compute_signals

router = APIRouter(prefix="/forex", tags=["forex"])

# Supported pairs: yfinance symbol → display label + default rates
PAIRS = {
    "EURUSD": {"sym": "EURUSD=X", "r_d": 0.0525, "r_f": 0.0400, "pip": 0.0001},
    "GBPUSD": {"sym": "GBPUSD=X", "r_d": 0.0525, "r_f": 0.0525, "pip": 0.0001},
    "USDJPY": {"sym": "USDJPY=X", "r_d": 0.0010, "r_f": 0.0525, "pip": 0.01},
    "USDCHF": {"sym": "USDCHF=X", "r_d": 0.0175, "r_f": 0.0525, "pip": 0.0001},
    "AUDUSD": {"sym": "AUDUSD=X", "r_d": 0.0525, "r_f": 0.0435, "pip": 0.0001},
    "USDCAD": {"sym": "USDCAD=X", "r_d": 0.0500, "r_f": 0.0525, "pip": 0.0001},
    "NZDUSD": {"sym": "NZDUSD=X", "r_d": 0.0525, "r_f": 0.0550, "pip": 0.0001},
    "EURJPY": {"sym": "EURJPY=X", "r_d": 0.0010, "r_f": 0.0400, "pip": 0.01},
    "GBPJPY": {"sym": "GBPJPY=X", "r_d": 0.0010, "r_f": 0.0525, "pip": 0.01},
    "EURGBP": {"sym": "EURGBP=X", "r_d": 0.0525, "r_f": 0.0400, "pip": 0.0001},
    "XAUUSD": {"sym": "GC=F",     "r_d": 0.0525, "r_f": 0.0000, "pip": 0.01},
}


def _fetch_rate(sym: str) -> dict:
    t = yf.Ticker(sym)
    fi = t.fast_info
    spot = fi.last_price
    prev = fi.previous_close
    if not spot:
        return None
    change = round((spot - prev) / prev * 100, 3) if prev else 0.0
    return {"spot": round(float(spot), 5), "prev": round(float(prev), 5) if prev else None,
            "change_pct": change}


@router.get("/pairs")
def list_pairs():
    """Return metadata for all supported forex pairs."""
    return [{"pair": k, **{f: v for f, v in meta.items() if f != "sym"}}
            for k, meta in PAIRS.items()]


@router.get("/rates")
def all_rates():
    """Fetch current rates for all major pairs (bulk call)."""
    results = []
    for pair, meta in PAIRS.items():
        try:
            data = _fetch_rate(meta["sym"])
            if data:
                results.append({"pair": pair, **data,
                                 "r_d": meta["r_d"], "r_f": meta["r_f"]})
        except Exception:
            pass
    return results


@router.get("/rate/{pair}")
def get_rate(pair: str):
    """Current spot rate + 24h change for a single pair."""
    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'. Supported: {list(PAIRS)}")
    meta = PAIRS[pair]
    data = _fetch_rate(meta["sym"])
    if not data:
        raise HTTPException(503, "Rate unavailable from data provider.")
    return {"pair": pair, **data, "r_d": meta["r_d"], "r_f": meta["r_f"],
            "pip": meta["pip"]}


@router.get("/ohlc/{pair}")
def get_ohlc(pair: str, interval: str = "5m", period: str = "2d"):
    """
    OHLC candlestick data for a pair.
    interval: 1m 5m 15m 30m 1h 4h 1d
    period:   1d 2d 5d 1mo
    """
    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    sym = PAIRS[pair]["sym"]
    valid_intervals = {"1m", "5m", "15m", "30m", "1h", "4h", "1d"}
    if interval not in valid_intervals:
        interval = "5m"
    try:
        hist = yf.download(sym, period=period, interval=interval,
                           progress=False, auto_adjust=True)
        if hist.empty:
            raise HTTPException(503, "No OHLC data returned.")
        hist = hist.dropna()
        # Flatten MultiIndex columns if present
        if isinstance(hist.columns, type(hist.columns)) and hasattr(hist.columns, 'droplevel'):
            try:
                hist.columns = hist.columns.droplevel(1)
            except Exception:
                pass
        return {
            "pair": pair,
            "interval": interval,
            "dates":  [str(d) for d in hist.index],
            "open":   [round(float(v), 5) for v in hist["Open"]],
            "high":   [round(float(v), 5) for v in hist["High"]],
            "low":    [round(float(v), 5) for v in hist["Low"]],
            "close":  [round(float(v), 5) for v in hist["Close"]],
            "volume": [int(v) for v in hist.get("Volume", [0]*len(hist))],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Data fetch failed: {e}")


@router.get("/signals/{pair}")
def get_signals(pair: str):
    """
    Compute full quant signal suite using 60 days of daily closes.
    Signals: EWMA vol, VaR/CVaR, Hurst exponent, OU mean-reversion,
             momentum, carry — all with academic citations.
    """
    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    meta = PAIRS[pair]
    try:
        hist = yf.download(meta["sym"], period="90d", interval="1d",
                           progress=False, auto_adjust=True)
        if hist.empty or len(hist) < 10:
            raise HTTPException(503, "Insufficient history for signal computation.")
        if isinstance(hist.columns, type(hist.columns)) and hasattr(hist.columns, 'droplevel'):
            try:
                hist.columns = hist.columns.droplevel(1)
            except Exception:
                pass
        closes = [float(v) for v in hist["Close"].dropna()]
        signals = compute_signals(closes, r_d=meta["r_d"], r_f=meta["r_f"])
        signals["pair"] = pair
        signals["current_price"] = round(closes[-1], 5)
        return signals
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Signal computation failed: {e}")
