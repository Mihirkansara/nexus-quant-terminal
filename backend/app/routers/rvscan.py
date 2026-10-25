"""
rvscan.py — Carry & RV Scanner: Deribit futures basis and perp funding, options-implied forwards,
SVI-residual rich/cheap scan net of bid/ask, put-call parity and static-arbitrage checks, and
the vol risk premium per expiry. Public Deribit API, no key; 503 when unreachable.
"""

import time

import numpy as np
from fastapi import APIRouter, HTTPException

from ..core.rv_scanner import carry_report, scan

router = APIRouter(prefix="/rvscan", tags=["rvscan"])


def _load(currency):
    from .vol import _cached, _crypto_closes, _deribit

    def load():
        opts = _deribit("get_book_summary_by_currency", currency=currency, kind="option")
        futs = _deribit("get_book_summary_by_currency", currency=currency, kind="future")
        idx = float(_deribit("get_index_price", index_name=f"{currency.lower()}_usd")["index_price"])
        return opts, futs, idx, int(time.time() * 1000)
    opts, futs, idx, now = _cached(f"rvscan:{currency}", 60, load)
    rv = None
    try:
        closes = _cached(f"closes:{currency}USD", 900, lambda: _crypto_closes(currency))
        r = np.diff(np.log(np.asarray(closes[-31:], float)))
        rv = float(np.std(r, ddof=1) * np.sqrt(365)) if len(r) >= 20 else None
    except Exception:
        pass
    return opts, futs, idx, now, rv


@router.get("/{currency}")
def rv_scan(currency: str, min_oi: float = 0.0, max_days: int = 200):
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "The RV scanner covers BTC and ETH (Deribit).")
    try:
        opts, futs, idx, now, rv = _load(currency)
    except Exception as e:
        raise HTTPException(503, f"Deribit data unavailable: {e}")
    carry = carry_report(futs, idx, now)
    rep = scan(opts, idx, now, carry, rv, min_oi=min_oi, max_days=max_days)
    if not rep["expiries"]:
        raise HTTPException(503, "No Deribit expiries with enough quotes.")
    return _clean({"currency": currency, "source": "Deribit public API (book summaries, 60 s cache)",
                   "carry": carry, **rep})


def _clean(obj):
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 8) if np.isfinite(x) else None
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
