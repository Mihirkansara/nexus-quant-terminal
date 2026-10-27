"""
variance.py — Variance Desk: model-free variance-swap strikes (continuous and Cboe/DVOL-style
discrete on the listed strikes), a replicated 30-day index against the live vol index,
vol-swap convexity, forward variance and calendar checks, risk-neutral moments (BKM), the
Breeden-Litzenberger density with probability / touch ladders against history, and the
variance risk premium (implied vs subsequently realised).

BTC / ETH: live Deribit book summaries (60 s cache), DVOL history. Other pairs: a vanna-volga
smile per tenor from ATM / 25Δ RR / 25Δ BF quotes, smoothed by raw SVI; GVZ / VXSLV history for
metals. Every source is free and keyless; a 503 when the live source is down.
"""

import time
from collections import defaultdict

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.variance import (constant_maturity, expiry_report, forward_vols, physical_returns,
                             svi_vol_fn, vrp_history)
from ..core.vanna_volga import pillars, strike_from_delta, vv_vol
from ..core.vol_analytics import fit_svi, parse_deribit_instrument
from .forex import PAIRS

router = APIRouter(prefix="/variance", tags=["variance"])
YEAR_MS = 365 * 86400 * 1000


def _chain(currency):
    """(option summaries, index price, now ms, latest DVOL or None) from Deribit."""
    from .vol import _cached, _deribit

    def load():
        now = int(time.time() * 1000)
        opts = _deribit("get_book_summary_by_currency", currency=currency, kind="option")
        idx = float(_deribit("get_index_price", index_name=f"{currency.lower()}_usd")["index_price"])
        try:
            rows = _deribit("get_volatility_index_data", currency=currency, start_timestamp=now - 3 * 3600_000,
                            end_timestamp=now, resolution="60").get("data", [])
            dvol = float(rows[-1][4]) if rows else None
        except Exception:
            dvol = None
        return opts, idx, now, dvol
    return _cached(f"variance:{currency}", 60, load)


def _history(pair):
    """(price dates, closes, index dates, index levels, index label); any part may be None."""
    dates = closes = None
    try:
        from .eventvol import _load_history
        data = _load_history(pair)
        if data and len(data["c"]) > 120:
            dates, closes = data["dates"], list(map(float, data["c"]))
    except Exception:
        pass
    try:
        from .risk import _iv_history
        d, lv, label = _iv_history(pair)
    except Exception:
        d, lv, label = None, None, None
    return dates, closes, d, lv, label


def _context(pair):
    """VRP history and the physical-return sampler for one pair (empty pieces when offline)."""
    ppy = PAIRS[pair]["periods_per_year"]
    dates, closes, d, lv, label = _history(pair)
    vrp = None
    if closes and d:
        vrp = vrp_history(d, lv, dates, closes, 30 if ppy == 365 else 21, ppy)
        vrp["index"] = label
    trailing = None
    if closes and len(closes) > 31:
        h = 30 if ppy == 365 else 21
        r = np.diff(np.log(closes[-h - 1:]))
        trailing = float(np.sqrt(np.mean(r ** 2) * ppy))
    return ppy, closes, vrp, trailing


def _assemble(pair, rows, ppy, closes, vrp, trailing, extra):
    rows.sort(key=lambda r: r["T"])
    for r in rows:
        r["vrp_vs_trailing"] = r["var_vol"] - trailing if trailing else None
    fwd = forward_vols(rows)
    cm = None
    if len(rows) >= 2:
        tgt = 30 / 365
        lo = [r for r in rows if r["T"] <= tgt]
        hi = [r for r in rows if r["T"] > tgt]
        a, b = (lo[-1], hi[0]) if lo and hi else (rows[0], rows[1]) if not lo else (rows[-2], rows[-1])
        cont = constant_maturity(a["T"], a["k_var"], b["T"], b["k_var"], tgt)
        disc = None
        if a.get("listed") and b.get("listed"):
            disc = constant_maturity(a["T"], a["listed"]["variance"], b["T"], b["listed"]["variance"], tgt)
        cm = {"from_days": a["days"], "to_days": b["days"], "continuous_vol": float(np.sqrt(max(cont, 0))),
              "listed_vol": float(np.sqrt(max(disc, 0))) if disc is not None else None,
              "extrapolated": not (lo and hi)}
    return _clean({"pair": pair, "periods_per_year": ppy, "expiries": rows, "forward_vols": fwd,
                   "constant_maturity_30d": cm, "vrp": vrp, "trailing_realised": trailing,
                   "history_points": len(closes) if closes else 0, **extra})


def _physical(closes, days, ppy):
    if not closes:
        return None
    h = max(1, int(round(days * ppy / 365)))
    r = physical_returns(closes, h)
    return r if len(r) else None


@router.get("/crypto/{currency}")
def crypto(currency: str, max_days: int = 370):
    """Variance swaps, moments and densities across the live Deribit expiries."""
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Live variance replication covers BTC and ETH (Deribit).")
    try:
        opts, index, now_ms, dvol = _chain(currency)
    except Exception as e:
        raise HTTPException(503, f"Deribit data unavailable: {e}")
    pair = f"{currency}USD"
    ppy, closes, vrp, trailing = _context(pair)
    volvol = (vrp or {}).get("volvol") or 0.9
    by_exp = defaultdict(list)
    for o in opts:
        p = parse_deribit_instrument(o.get("instrument_name", ""))
        F, iv = o.get("underlying_price"), o.get("mark_iv")
        if not p or not F or not iv:
            continue
        exp, K, cp = p
        T = (exp.timestamp() * 1000 - now_ms) / YEAR_MS
        if T * 365 < 1.5 or T * 365 > max_days:
            continue
        by_exp[exp.strftime("%Y-%m-%d")].append({"K": float(K), "call": cp == "call", "F": float(F), "T": T,
                                                 "iv": float(iv) / 100, "mark": o.get("mark_price"),
                                                 "bid": o.get("bid_price")})
    rows = []
    for e in sorted(by_exp):
        xs = by_exp[e]
        F = float(np.median([x["F"] for x in xs]))
        T = xs[0]["T"]
        otm = [x for x in xs if (x["call"] and x["K"] >= F) or (not x["call"] and x["K"] < F)]
        if len(otm) < 5:
            continue
        k = np.log(np.array([x["K"] for x in otm]) / F)
        params, rmse = fit_svi(k, np.array([x["iv"] for x in otm]), T)
        vol_fn = svi_vol_fn(params, F, T)
        atm = float(vol_fn(np.array([F]))[0])
        legs = defaultdict(dict)
        for x in xs:
            if x["mark"]:
                legs[x["K"]]["C" if x["call"] else "P"] = x
        ks = sorted(K for K, lp in legs.items() if "C" in lp and "P" in lp)
        listed = None
        if len(ks) >= 5:
            listed = {"strikes": ks,
                      "calls": [legs[K]["C"]["mark"] * F for K in ks], "puts": [legs[K]["P"]["mark"] * F for K in ks],
                      "call_bids": [legs[K]["C"]["bid"] or 0.0 for K in ks],
                      "put_bids": [legs[K]["P"]["bid"] or 0.0 for K in ks]}
        rep = expiry_report(vol_fn, F, T, atm, volvol, listed, _physical(closes, T * 365, ppy))
        rows.append({"expiry": e, "svi_rmse": rmse, "n_quotes": len(otm), **rep})
    if not rows:
        raise HTTPException(503, "No Deribit expiries with enough quotes.")
    return _assemble(pair, rows, ppy, closes, vrp, trailing,
                     {"source": "Deribit public API (book summaries, DVOL), 60 s cache", "spot": index,
                      "live_index": dvol, "live_index_label": "Deribit DVOL", "volvol": volvol})


class Tenor(BaseModel):
    T: float = Field(..., gt=0.004, le=3)
    atm: float = Field(..., gt=0.005, lt=3)
    rr25: float = Field(default=0.0, gt=-0.5, lt=0.5)
    bf25: float = Field(default=0.003, ge=-0.05, lt=0.5)


class SmileRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float = Field(..., gt=0)
    r_d: float = 0.04
    r_f: float = 0.0
    tenors: list[Tenor] = Field(..., min_length=1, max_length=12)
    volvol: float | None = Field(default=None, ge=0, le=5)


@router.post("/smile")
def from_smile(req: SmileRequest):
    """The same desk for FX and metals from ATM / 25Δ RR / 25Δ BF quotes per tenor."""
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    ppy, closes, vrp, trailing = _context(pair)
    volvol = req.volvol if req.volvol is not None else ((vrp or {}).get("volvol") or 0.8)
    rows = []
    for t in req.tenors:
        try:
            pl = pillars(req.S, t.T, req.r_d, req.r_f, t.atm, t.rr25, t.bf25)
        except ValueError as e:
            raise HTTPException(422, f"Tenor {t.T:g}y: {e}")
        F = req.S * np.exp((req.r_d - req.r_f) * t.T)
        lo = strike_from_delta(req.S, t.T, req.r_d, req.r_f, pl[0]["vol"], 0.05, "put")
        hi = strike_from_delta(req.S, t.T, req.r_d, req.r_f, pl[2]["vol"], 0.05, "call")
        K = np.exp(np.linspace(np.log(lo), np.log(hi), 17))
        iv = vv_vol(K, req.S, t.T, req.r_d, req.r_f, pl)
        params, rmse = fit_svi(np.log(K / F), np.asarray(iv, float), t.T)
        vol_fn = svi_vol_fn(params, F, t.T)
        rep = expiry_report(vol_fn, F, t.T, float(vol_fn(np.array([F]))[0]), volvol, None,
                            _physical(closes, t.T * 365, ppy))
        rows.append({"expiry": f"{t.T * 12:.1f}M" if t.T >= 0.08 else f"{t.T * 52:.1f}W",
                     "svi_rmse": rmse, "quotes": t.model_dump(), **rep})
    return _assemble(pair, rows, ppy, closes, vrp, trailing,
                     {"source": "Vanna-volga smile from ATM / 25Δ RR / 25Δ BF, raw-SVI smoothed", "spot": req.S,
                      "live_index": (vrp or {}).get("current_implied") and vrp["current_implied"] * 100,
                      "live_index_label": (vrp or {}).get("index"), "volvol": volvol})


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
