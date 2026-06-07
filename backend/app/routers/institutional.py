"""
institutional.py — Free institutional flow data.

Sources:
  1. CFTC TFF (Traders in Financial Futures) — Socrata API on publicreporting.cftc.gov
     Dataset: gpe5-46if  (no API key needed, weekly, official CFTC data)
     Categories: Dealers, Asset Managers, Leveraged Money (hedge funds), Other, Non-reportable
  2. Volume Profile — approximated from yfinance OHLCV daily bars
     (distributes bar volume proportionally across the High-Low range)
"""

import numpy as np
import httpx
import urllib.parse
import yfinance as yf
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/institutional", tags=["institutional"])

CFTC_BASE    = "https://publicreporting.cftc.gov"
CFTC_DATASET = "gpe5-46if"

# Map forex pair → CFTC market name + yfinance symbol
COT_MAP = {
    "EURUSD": {"cot": "EURO FX - CHICAGO MERCANTILE EXCHANGE",               "sym": "EURUSD=X"},
    "GBPUSD": {"cot": "BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE", "sym": "GBPUSD=X"},
    "USDJPY": {"cot": "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",           "sym": "USDJPY=X"},
    "AUDUSD": {"cot": "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",      "sym": "AUDUSD=X"},
    "USDCAD": {"cot": "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",        "sym": "USDCAD=X"},
    "NZDUSD": {"cot": "NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE",     "sym": "NZDUSD=X"},
    "USDCHF": {"cot": "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",            "sym": "USDCHF=X"},
    "EURJPY": {"cot": "EURO FX - CHICAGO MERCANTILE EXCHANGE",                "sym": "EURJPY=X"},
    "GBPJPY": {"cot": "BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE", "sym": "GBPJPY=X"},
    "EURGBP": {"cot": "EURO FX - CHICAGO MERCANTILE EXCHANGE",                "sym": "EURGBP=X"},
    "XAUUSD": {"cot": "GOLD - COMMODITY EXCHANGE INC.",                       "sym": "GC=F"},
}


def _safe_int(v) -> int:
    try: return int(v or 0)
    except: return 0

def _safe_float(v) -> float:
    try: return float(v or 0)
    except: return 0.0


def _fetch_cot(market_name: str, weeks: int = 52) -> list[dict]:
    """Fetch TFF COT data from CFTC Socrata API (publicreporting.cftc.gov)."""
    where  = urllib.parse.quote(f"market_and_exchange_names='{market_name}'")
    url    = (
        f"{CFTC_BASE}/resource/{CFTC_DATASET}.json"
        f"?$where={where}"
        f"&$order=report_date_as_yyyy_mm_dd+DESC"
        f"&$limit={weeks}"
    )
    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


def _parse_tff(records: list[dict]) -> dict:
    """Parse TFF records into structured signal data (newest-first records → oldest-first output)."""
    if not records:
        return {}

    rows = list(reversed(records))   # oldest first for charting

    dates = []
    oi, dealer_net, assetmgr_net, levmoney_net, other_net = [], [], [], [], []
    chg_oi, chg_am_long, chg_am_short, chg_lm_long, chg_lm_short = [], [], [], [], []
    pct_am_long, pct_am_short, pct_lm_long, pct_lm_short = [], [], [], []
    am_long_list, am_short_list, lm_long_list, lm_short_list = [], [], [], []

    for r in rows:
        d = (r.get("report_date_as_yyyy_mm_dd") or "")[:10]
        if not d:
            continue
        dates.append(d)

        aml  = _safe_int(r.get("asset_mgr_positions_long"))
        ams  = _safe_int(r.get("asset_mgr_positions_short"))
        lml  = _safe_int(r.get("lev_money_positions_long"))
        lms  = _safe_int(r.get("lev_money_positions_short"))
        dl   = _safe_int(r.get("dealer_positions_long_all"))
        ds   = _safe_int(r.get("dealer_positions_short_all"))
        ol   = _safe_int(r.get("other_rept_positions_long"))
        os_  = _safe_int(r.get("other_rept_positions_short"))
        total_oi = _safe_int(r.get("open_interest_all"))

        oi.append(total_oi)
        dealer_net.append(dl - ds)
        assetmgr_net.append(aml - ams)
        levmoney_net.append(lml - lms)
        other_net.append(ol - os_)
        am_long_list.append(aml)
        am_short_list.append(ams)
        lm_long_list.append(lml)
        lm_short_list.append(lms)

        chg_oi.append(_safe_int(r.get("change_in_open_interest_all")))
        chg_am_long.append(_safe_int(r.get("change_in_asset_mgr_long")))
        chg_am_short.append(_safe_int(r.get("change_in_asset_mgr_short")))
        chg_lm_long.append(_safe_int(r.get("change_in_lev_money_long")))
        chg_lm_short.append(_safe_int(r.get("change_in_lev_money_short")))

        pct_am_long.append(_safe_float(r.get("pct_of_oi_asset_mgr_long")))
        pct_am_short.append(_safe_float(r.get("pct_of_oi_asset_mgr_short")))
        pct_lm_long.append(_safe_float(r.get("pct_of_oi_lev_money_long")))
        pct_lm_short.append(_safe_float(r.get("pct_of_oi_lev_money_short")))

    if not dates:
        return {}

    def _cot_index(series):
        lo, hi = min(series), max(series)
        return round((series[-1] - lo) / max(hi - lo, 1) * 100, 1) if hi > lo else 50.0

    am_idx  = _cot_index(assetmgr_net)
    lm_idx  = _cot_index(levmoney_net)

    def _bias(idx):
        return "BULLISH" if idx >= 65 else ("BEARISH" if idx <= 35 else "NEUTRAL")

    am_bias = _bias(am_idx)
    lm_bias = _bias(lm_idx)

    # Composite: weight asset managers 60%, leveraged money 40%
    composite_idx = round(am_idx * 0.6 + lm_idx * 0.4, 1)
    composite_bias = _bias(composite_idx)

    wk_chg_am = (assetmgr_net[-1] - assetmgr_net[-2]) if len(assetmgr_net) >= 2 else 0
    wk_chg_lm = (levmoney_net[-1] - levmoney_net[-2]) if len(levmoney_net) >= 2 else 0

    return {
        "dates":           dates,
        "open_interest":   oi,
        "change_oi":       chg_oi,
        # Asset Managers (institutional — real money)
        "am_net":          assetmgr_net,
        "am_long":         am_long_list,
        "am_short":        am_short_list,
        "am_pct_long":     pct_am_long,
        "am_pct_short":    pct_am_short,
        "am_index":        am_idx,
        "am_bias":         am_bias,
        "am_current_net":  assetmgr_net[-1],
        "am_wk_change":    wk_chg_am,
        # Leveraged Money (hedge funds, CTAs)
        "lm_net":          levmoney_net,
        "lm_long":         lm_long_list,
        "lm_short":        lm_short_list,
        "lm_pct_long":     pct_lm_long,
        "lm_pct_short":    pct_lm_short,
        "lm_index":        lm_idx,
        "lm_bias":         lm_bias,
        "lm_current_net":  levmoney_net[-1],
        "lm_wk_change":    wk_chg_lm,
        # Dealers
        "dealer_net":      dealer_net,
        # Other
        "other_net":       other_net,
        # Composite
        "composite_index": composite_idx,
        "composite_bias":  composite_bias,
        "weeks":           len(dates),
        "latest_date":     dates[-1],
        "source":          "CFTC TFF — Traders in Financial Futures (Socrata API)",
    }


def _volume_profile(sym: str, period: str = "3mo", buckets: int = 40) -> dict:
    """
    Approximate volume profile from daily OHLCV.
    Distributes each bar's volume uniformly across its High-Low range.
    """
    try:
        hist = yf.download(sym, period=period, interval="1d",
                           progress=False, auto_adjust=True)
        if hist.empty:
            return {}
        if hasattr(hist.columns, "droplevel"):
            try: hist.columns = hist.columns.droplevel(1)
            except Exception: pass

        highs   = hist["High"].dropna().values.astype(float)
        lows    = hist["Low"].dropna().values.astype(float)
        volumes = hist["Volume"].dropna().values.astype(float)
        closes  = hist["Close"].dropna().values.astype(float)

        global_lo = float(np.min(lows))
        global_hi = float(np.max(highs))
        if global_hi <= global_lo:
            return {}

        bucket_size  = (global_hi - global_lo) / buckets
        vol_profile  = np.zeros(buckets)

        for i in range(len(highs)):
            lo_b = int((lows[i]  - global_lo) / bucket_size)
            hi_b = int((highs[i] - global_lo) / bucket_size)
            lo_b = max(0, min(lo_b, buckets - 1))
            hi_b = max(0, min(hi_b, buckets - 1))
            span = max(hi_b - lo_b + 1, 1)
            vol_per_bucket = volumes[i] / span if volumes[i] > 0 else 0
            vol_profile[lo_b:hi_b + 1] += vol_per_bucket

        prices  = [round(global_lo + (j + 0.5) * bucket_size, 5) for j in range(buckets)]
        poc_idx = int(np.argmax(vol_profile))
        poc     = prices[poc_idx]

        total_vol = float(np.sum(vol_profile))
        va_target = total_vol * 0.70
        lo_idx, hi_idx = poc_idx, poc_idx
        va_vol = float(vol_profile[poc_idx])
        while va_vol < va_target and (lo_idx > 0 or hi_idx < buckets - 1):
            expand_lo = vol_profile[lo_idx - 1] if lo_idx > 0          else 0
            expand_hi = vol_profile[hi_idx + 1] if hi_idx < buckets - 1 else 0
            if expand_hi >= expand_lo:
                hi_idx = min(hi_idx + 1, buckets - 1); va_vol += expand_hi
            else:
                lo_idx = max(lo_idx - 1, 0);           va_vol += expand_lo

        return {
            "prices":        prices,
            "volumes":       [round(float(v), 0) for v in vol_profile],
            "poc":           poc,
            "vah":           prices[hi_idx],
            "val":           prices[lo_idx],
            "current_price": round(float(closes[-1]), 5),
            "global_hi":     round(global_hi, 5),
            "global_lo":     round(global_lo, 5),
            "total_volume":  round(total_vol, 0),
        }
    except Exception:
        return {}


@router.get("/{pair}")
def get_institutional(pair: str, weeks: int = 26):
    """
    Institutional flow data: CFTC TFF positioning + Volume Profile.
    Data sources are 100% free — no API keys required.
    """
    pair = pair.upper()
    if pair not in COT_MAP:
        raise HTTPException(404, f"No institutional data for '{pair}'.")

    meta  = COT_MAP[pair]
    weeks = min(max(weeks, 4), 52)

    raw   = _fetch_cot(meta["cot"], weeks)
    cot   = _parse_tff(raw)
    vp    = _volume_profile(meta["sym"])

    if not cot and not vp:
        raise HTTPException(503, "CFTC API and volume profile both unavailable.")

    return {
        "pair":           pair,
        "cot":            cot,
        "volume_profile": vp,
        "data_sources": [
            "CFTC TFF (Traders in Financial Futures) — publicreporting.cftc.gov, weekly, free",
            "Volume Profile — yfinance OHLCV daily, 3 months",
        ],
    }
