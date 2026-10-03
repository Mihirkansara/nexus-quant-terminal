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


# ─── Vol forecast & regime engine ─────────────────────────────────────────────

def _yf_ohlc(sym: str, period: str = "3y"):
    hist = yf.download(sym, period=period, interval="1d", progress=False, auto_adjust=True)
    if hist.empty:
        return None
    if hasattr(hist.columns, "droplevel"):
        try:
            hist.columns = hist.columns.droplevel(1)
        except Exception:
            pass
    hist = hist[["Open", "High", "Low", "Close"]].dropna()
    hist = hist[(hist > 0).all(axis=1)]
    return {"dates": [d.date() for d in hist.index],
            **{k: hist[col].to_numpy(dtype=float) for k, col in
               (("o", "Open"), ("h", "High"), ("l", "Low"), ("c", "Close"))}}


def _crypto_ohlc(currency: str):
    """Daily OHLC of the Deribit perpetual (3y); falls back to yfinance spot."""
    now = int(time.time() * 1000)
    try:
        res = _deribit("get_tradingview_chart_data", instrument_name=f"{currency}-PERPETUAL",
                       start_timestamp=now - 1100 * _DAY_MS, end_timestamp=now, resolution="1D")
        if res.get("status", "ok") == "ok" and len(res.get("close", [])) > 400:
            from datetime import datetime, timezone
            arr = {k: np.asarray(res[src], dtype=float) for k, src in
                   (("o", "open"), ("h", "high"), ("l", "low"), ("c", "close"))}
            ok = np.all([arr[k] > 0 for k in arr], axis=0)
            return {"dates": [datetime.fromtimestamp(t / 1000, tz=timezone.utc).date()
                              for t, keep in zip(res["ticks"], ok) if keep],
                    **{k: a[ok] for k, a in arr.items()}}
    except Exception:
        pass
    return _yf_ohlc(f"{currency}-USD")


@router.get("/forecast/{pair}")
def get_vol_forecast(pair: str):
    """
    HAR-RV / GJR-GARCH / gradient-boosting vol forecasts (1D, 1W, 1M) with a rolling
    out-of-sample QLIKE backtest, inverse-QLIKE ensemble, 2-state HMM regime and,
    for BTC/ETH, a comparison against Deribit implied vols.
    """
    from ..core.vol_forecast import forecast_report

    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    meta = PAIRS[pair]
    crypto = meta["asset_class"] == "crypto"

    def load():
        data = _crypto_ohlc(pair[:3]) if crypto else _yf_ohlc(meta["sym"])
        if not data or len(data["c"]) < 400:
            raise ValueError("not enough daily OHLC history (need ~400 days)")
        implied, dvol = None, None
        if crypto:
            try:
                surf = get_crypto_vol(pair[:3])
                ts = {r["tenor"]: r["atm_vol"] for r in surf.get("atm_term_structure", [])}
                implied = {"1W": ts.get("1W"), "1M": surf.get("iv_30d")}
                dvol = surf.get("dvol")
            except HTTPException:
                pass
        rep = forecast_report(data["o"], data["h"], data["l"], data["c"], dates=data["dates"],
                              ppy=meta["periods_per_year"], implied=implied)
        return {**rep, "dvol": dvol, "last_price": float(data["c"][-1]),
                "last_date": str(data["dates"][-1])}

    try:
        report = _cached(f"forecast:{pair}", 1800, load)
    except Exception as e:
        _cache.pop(f"forecast:{pair}", None)
        raise HTTPException(503, f"Vol forecast unavailable: {e}")
    return {"pair": pair, "asset_class": meta["asset_class"], **report}
