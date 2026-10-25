"""
volumeprofile.py — Live Volume Profile engine (TradingView-style).

Computes volume-at-price distributions from intraday OHLCV bars:
  • POC  (Point of Control)      — price level with max traded volume
  • VAH / VAL (Value Area)       — 70% volume band around POC
  • HVN / LVN                    — high / low volume nodes (local extrema)
  • Buy / Sell / Delta volume    — up-bar vs down-bar classification
  • Session / Daily / Weekly profiles

FX pairs on Yahoo report tick volume (count of price updates), which is
the industry-standard FX proxy (same as MT4/MT5). When volume is zero,
each bar contributes weight 1 distributed across its high-low range.

No database, no Redis — in-memory TTL cache (same pattern as livedata.py).
"""

import time
import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException

from .forex import PAIRS as FX_PAIRS

router = APIRouter(prefix="/volume", tags=["volume"])

# Extra symbols beyond the forex router's pair list
EXTRA_SYMBOLS = {
    "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD",
}

# profile_type → (yfinance period, interval, cache TTL seconds)
PROFILES = {
    "session": ("1d",  "1m",  15),
    "daily":   ("5d",  "5m",  60),
    "weekly":  ("1mo", "30m", 300),
}

N_BUCKETS = 48          # price levels in the profile
VALUE_AREA_PCT = 0.70   # standard 70% value area

_cache: dict = {}        # key: (pair, profile) → {"data":…, "ts":…}


def _symbol_for(pair: str) -> str | None:
    if pair in FX_PAIRS:
        return FX_PAIRS[pair]["sym"]
    return EXTRA_SYMBOLS.get(pair)


def _fetch_bars(sym: str, period: str, interval: str):
    hist = yf.download(sym, period=period, interval=interval,
                       progress=False, auto_adjust=True)
    if hist.empty:
        return None
    hist = hist.dropna()
    if hasattr(hist.columns, "droplevel"):
        try:
            hist.columns = hist.columns.droplevel(1)
        except Exception:
            pass
    return hist


def _build_profile(hist) -> dict:
    o = hist["Open"].to_numpy(dtype=float)
    h = hist["High"].to_numpy(dtype=float)
    l = hist["Low"].to_numpy(dtype=float)
    c = hist["Close"].to_numpy(dtype=float)
    v = hist["Volume"].to_numpy(dtype=float) if "Volume" in hist else np.zeros(len(o))

    # FX tick-volume proxy: bars with zero volume each count as 1 tick unit
    if v.sum() <= 0:
        v = np.ones(len(o))

    lo, hi = float(l.min()), float(h.max())
    if hi <= lo:
        hi = lo * 1.0001 + 1e-9
    edges = np.linspace(lo, hi, N_BUCKETS + 1)
    mids = (edges[:-1] + edges[1:]) / 2

    buy = np.zeros(N_BUCKETS)
    sell = np.zeros(N_BUCKETS)

    # Distribute each bar's volume uniformly across the buckets its range spans.
    # Direction: close vs previous close (FX 1m bars often have open == close,
    # which would misclassify everything if compared intra-bar). Flat bars 50/50.
    for i in range(len(o)):
        i0 = int(np.searchsorted(edges, l[i], side="right") - 1)
        i1 = int(np.searchsorted(edges, h[i], side="right") - 1)
        i0 = max(0, min(i0, N_BUCKETS - 1))
        i1 = max(0, min(i1, N_BUCKETS - 1))
        span = i1 - i0 + 1
        per = v[i] / span
        ref = c[i - 1] if i > 0 else o[i]
        if c[i] > ref:
            buy[i0:i1 + 1] += per
        elif c[i] < ref:
            sell[i0:i1 + 1] += per
        else:
            buy[i0:i1 + 1] += per / 2
            sell[i0:i1 + 1] += per / 2

    total = buy + sell
    grand = float(total.sum())
    if grand <= 0:
        raise HTTPException(503, "No volume data available.")

    # POC
    poc_i = int(total.argmax())

    # Value area: expand from POC, greedily take the larger neighbor
    va_vol = total[poc_i]
    lo_i = hi_i = poc_i
    target = grand * VALUE_AREA_PCT
    while va_vol < target and (lo_i > 0 or hi_i < N_BUCKETS - 1):
        below = total[lo_i - 1] if lo_i > 0 else -1.0
        above = total[hi_i + 1] if hi_i < N_BUCKETS - 1 else -1.0
        if above >= below:
            hi_i += 1
            va_vol += total[hi_i]
        else:
            lo_i -= 1
            va_vol += total[lo_i]

    # HVN / LVN: local maxima / minima of the smoothed profile
    kernel = np.array([0.25, 0.5, 0.25])
    smooth = np.convolve(total, kernel, mode="same")
    mean = smooth.mean()
    hvn, lvn = [], []
    for i in range(1, N_BUCKETS - 1):
        if smooth[i] > smooth[i - 1] and smooth[i] >= smooth[i + 1] and smooth[i] > mean * 1.15:
            hvn.append(i)
        if smooth[i] < smooth[i - 1] and smooth[i] <= smooth[i + 1] and smooth[i] < mean * 0.6:
            lvn.append(i)
    hvn = sorted(hvn, key=lambda i: -total[i])[:4]
    lvn = sorted(lvn, key=lambda i: total[i])[:4]

    buy_total, sell_total = float(buy.sum()), float(sell.sum())
    decimals = 5 if mids[-1] < 100 else 3

    return {
        "buckets": [
            {
                "price": round(float(mids[i]), decimals),
                "vol":   round(float(total[i]), 2),
                "buy":   round(float(buy[i]), 2),
                "sell":  round(float(sell[i]), 2),
                "delta": round(float(buy[i] - sell[i]), 2),
                "in_va": lo_i <= i <= hi_i,
                "is_poc": i == poc_i,
            }
            for i in range(N_BUCKETS)
        ],
        "poc":  round(float(mids[poc_i]), decimals),
        "vah":  round(float(mids[hi_i]), decimals),
        "val":  round(float(mids[lo_i]), decimals),
        "hvn":  [round(float(mids[i]), decimals) for i in hvn],
        "lvn":  [round(float(mids[i]), decimals) for i in lvn],
        "session_volume": round(grand, 2),
        "buy_volume":     round(buy_total, 2),
        "sell_volume":    round(sell_total, 2),
        "delta_volume":   round(buy_total - sell_total, 2),
        "aggressive_buy_pct": round(buy_total / grand * 100, 1),
        "last_price": round(float(c[-1]), decimals),
        "bars": len(o),
        "volume_kind": "exchange" if "Volume" in hist and float(hist["Volume"].sum()) > 0 else "tick",
    }


@router.get("/pairs")
def volume_pairs():
    """Pairs supported by the volume profile engine."""
    return sorted(list(FX_PAIRS.keys()) + list(EXTRA_SYMBOLS.keys()))


@router.get("/profile/{pair}")
def volume_profile(pair: str, profile: str = "session"):
    """
    Volume profile for a pair.
    profile: session (1m bars, today) | daily (5m, 5d) | weekly (30m, 1mo)
    Cached 15s / 60s / 300s respectively.
    """
    pair = pair.upper()
    sym = _symbol_for(pair)
    if not sym:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    if profile not in PROFILES:
        profile = "session"
    period, interval, ttl = PROFILES[profile]

    key = (pair, profile)
    now = time.time()
    hit = _cache.get(key)
    if hit and (now - hit["ts"]) < ttl:
        return {**hit["data"], "cached": True}

    hist = _fetch_bars(sym, period, interval)
    if hist is None or len(hist) < 5:
        # serve stale cache rather than failing if provider hiccups
        if hit:
            return {**hit["data"], "cached": True, "stale": True}
        raise HTTPException(503, "No intraday data returned.")

    data = {
        "pair": pair,
        "profile": profile,
        "interval": interval,
        **_build_profile(hist),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cached": False,
    }
    _cache[key] = {"data": data, "ts": now}
    return data
