"""
positioning.py — Positioning Desk: live BTC / ETH dealer gamma exposure, gamma flip, walls,
vanna / charm flows, max pain and implied moves from Deribit open interest (public API,
no key). Fails with 503 when Deribit is unreachable.
"""

import time

import numpy as np
from fastapi import APIRouter, HTTPException

from ..core.positioning import positioning_report

router = APIRouter(prefix="/positioning", tags=["positioning"])


def _book(currency):
    from .vol import _cached, _deribit

    def load():
        rows = _deribit("get_book_summary_by_currency", currency=currency, kind="option")
        idx = _deribit("get_index_price", index_name=f"{currency.lower()}_usd")["index_price"]
        return rows, float(idx), int(time.time() * 1000)
    return _cached(f"posbook:{currency}", 60, load)


@router.get("/{currency}")
def positioning(currency: str, convention: str = "classic", max_days: int = 120):
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Positioning is available for BTC and ETH (Deribit).")
    if convention not in ("classic", "short_all"):
        raise HTTPException(422, "convention must be 'classic' or 'short_all'.")
    if not 1 <= max_days <= 400:
        raise HTTPException(422, "max_days must be between 1 and 400.")
    try:
        rows, spot, now_ms = _book(currency)
    except Exception as e:
        raise HTTPException(503, f"Deribit data unavailable: {e}")
    try:
        rep = positioning_report(rows, now_ms, spot, convention, max_days)
    except ValueError as e:
        raise HTTPException(503, str(e))
    return _clean({"currency": currency, "source": "Deribit public API (book summaries, 60 s cache)", **rep})


def _clean(obj):
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 6) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
