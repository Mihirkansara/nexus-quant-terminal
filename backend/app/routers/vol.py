"""
vol.py — Vol Lab endpoints: realised-vol cone for any pair and a live Deribit
BTC/ETH implied-vol surface (SVI per expiry), ATM/RR/BF term structure,
DVOL and vol risk premium. All sources are free and need no API key.
"""

import time

import httpx
import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException

from ..core.vol_analytics import crypto_vol_report, vol_cone
from .forex import PAIRS

router = APIRouter(prefix="/vol", tags=["vol"])

DERIBIT = "https://www.deribit.com/api/v2/public"
_DAY_MS = 24 * 3600 * 1000
_cache: dict = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    value = fn()
    _cache[key] = (time.time(), value)
    return value


def _deribit(method: str, **params):
    r = httpx.get(f"{DERIBIT}/{method}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()["result"]


def _yf_closes(sym: str, period: str = "2y") -> list:
    hist = yf.download(sym, period=period, interval="1d", progress=False, auto_adjust=True)
    if hist.empty:
        return []
    if hasattr(hist.columns, "droplevel"):
        try:
            hist.columns = hist.columns.droplevel(1)
        except Exception:
            pass
    return [float(v) for v in hist["Close"].dropna()]


def _crypto_closes(currency: str) -> list:
    """Daily closes of the Deribit perpetual; falls back to yfinance spot."""
    now = int(time.time() * 1000)
    try:
        res = _deribit("get_tradingview_chart_data", instrument_name=f"{currency}-PERPETUAL",
                       start_timestamp=now - 730 * _DAY_MS, end_timestamp=now, resolution="1D")
        closes = [float(c) for c in res.get("close", []) if c]
        if len(closes) > 60:
            return closes
    except Exception:
        pass
    try:
        return _yf_closes(f"{currency}-USD")
    except Exception:
        return []


@router.get("/cone/{pair}")
def get_vol_cone(pair: str):
    """Burghardt-Lane realised volatility cone (2y of daily closes)."""
    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    meta = PAIRS[pair]

    def load():
        if meta["asset_class"] == "crypto":
            return _crypto_closes(pair[:3])
        return _yf_closes(meta["sym"])

    try:
        closes = _cached(f"closes:{pair}", 900, load)
    except Exception as e:
        raise HTTPException(503, f"Price history unavailable: {e}")
    if len(closes) < 60:
        _cache.pop(f"closes:{pair}", None)
        raise HTTPException(503, "Not enough price history for a volatility cone.")
    cone = vol_cone(closes, meta["periods_per_year"])
    return {"pair": pair, "asset_class": meta["asset_class"],
            "last_price": round(closes[-1], 6), **cone}


@router.get("/crypto/{currency}")
def get_crypto_vol(currency: str):
    """Live Deribit option surface for BTC or ETH with SVI fits, term structure and VRP."""
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Deribit surface is available for BTC and ETH.")

    def load():
        now = int(time.time() * 1000)
        summaries = _deribit("get_book_summary_by_currency", currency=currency, kind="option")
        try:
            index_price = _deribit("get_index_price",
                                   index_name=f"{currency.lower()}_usd")["index_price"]
        except Exception:
            index_price = None
        try:
            dvol = _deribit("get_volatility_index_data", currency=currency,
                            start_timestamp=now - 90 * _DAY_MS, end_timestamp=now,
                            resolution="1D").get("data", [])
        except Exception:
            dvol = []
        closes = _cached(f"closes:{currency}USD", 900, lambda: _crypto_closes(currency))
        report = crypto_vol_report(summaries, now, index_price, dvol, closes)
        if not report["expiries"]:
            raise ValueError("no expiries with enough quotes to fit")
        return report

    try:
        report = _cached(f"crypto:{currency}", 60, load)
    except Exception as e:
        _cache.pop(f"crypto:{currency}", None)
        raise HTTPException(503, f"Deribit data unavailable: {e}")
    return {"currency": currency, "source": "Deribit public API", **report}
