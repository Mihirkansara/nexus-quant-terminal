"""
eventvol.py — Event & Weekend Vol desk: strips FOMC/CPI/NFP event variance and the
weekend weight out of the ATM term structure (live Deribit for BTC/ETH, quotes or
assumptions for metals/FX), prices any expiry on vol time, and backs the assumptions
with a realised day-of-week / FOMC study. Free sources only; every live input degrades
gracefully.
"""

from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.event_vol import (EVENT_TYPES, classify_ff_event, default_events, event_moves,
                              fit_term_structure, forward_vols, model_vol, realised_study)
from .forex import PAIRS

router = APIRouter(prefix="/eventvol", tags=["eventvol"])

TENORS = [("O/N", 1), ("1W", 7), ("2W", 14), ("1M", 30), ("2M", 61), ("3M", 91)]


def _now():
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _market(pair):
    return "crypto" if PAIRS[pair]["asset_class"] == "crypto" else "fx"


def _cut(day: datetime, market: str):
    """Expiry cut: Deribit 08:00 UTC for crypto, NY 10:00 ET (≈14:00/15:00 UTC) otherwise."""
    from ..core.event_vol import et_to_utc
    if market == "crypto":
        return day.replace(hour=8, minute=0, second=0, microsecond=0)
    return et_to_utc(day.date().isoformat(), 10.0)


def calendar_events(now, horizon=120, live=True):
    """Built-in US calendar merged with live Forex Factory high-impact events (if reachable)."""
    events = default_events(now, horizon)
    source = ["built-in 2026 FOMC/CPI/NFP schedule"]
    if live:
        try:
            from .news import _load_calendar
            cal = _load_calendar()
            ff = cal.get("events", []) if isinstance(cal, dict) else []
            added = 0
            for ev in ff:
                if (ev.get("impact") or "").lower() != "high" or not ev.get("datetime_utc"):
                    continue
                t = classify_ff_event(ev.get("title", ""), ev.get("country", ""))
                if not t:
                    continue
                ts = datetime.strptime(ev["datetime_utc"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
                if not (now < ts <= now + timedelta(days=horizon)):
                    continue
                if any(e["type"] == t and abs((e["time"] - ts).total_seconds()) < 36 * 3600 for e in events):
                    continue
                events.append({"type": t, "name": f'{ev.get("country")} {ev.get("title")}', "time": ts})
                added += 1
            if added:
                source.append(f"Forex Factory (+{added})")
        except Exception:
            pass
    return sorted(events, key=lambda e: e["time"]), source


def _ev_json(events):
    return [{"type": e["type"], "name": e.get("name", e["type"]), "time": e["time"].isoformat()} for e in events]


def _curve(now, base, w, events, ev_var, market, days=90):
    """Model ATM vol for daily expiries 1..days (at the market's cut), plus the flat-calendar vol."""
    out = []
    for d in range(1, days + 1):
        end = _cut(now + timedelta(days=d), market)
        if end <= now:
            continue
        m = model_vol(now, end, base, w, events, ev_var, market)
        out.append({"date": end.date().isoformat(), "days": m["days"], "vol": m["vol"],
                    "event_share": m["share"]["events"], "weekend": end.weekday() >= 5})
    return out


def _tenors(now, base, w, events, ev_var, market):
    rows = []
    for name, d in TENORS:
        end = _cut(now + timedelta(days=d), market)
        m = model_vol(now, end, base, w, events, ev_var, market)
        rows.append({"tenor": name, "expiry": end.isoformat(), "days": m["days"], "vol": m["vol"],
                     "share": m["share"], "events": [e["type"] for e in m["events"]]})
    pts = [(r["days"] / 365, r["vol"]) for r in rows]
    for r, f in zip(rows[1:], forward_vols(pts)):
        r["fwd_vol"] = f["fwd_vol"]
    return rows


def _load_history(pair):
    from .vol import _cached, _crypto_ohlc, _yf_ohlc
    meta = PAIRS[pair]
    return _cached(f"ohlc:{pair}", 1800,
                   lambda: _crypto_ohlc(pair[:3]) if meta["asset_class"] == "crypto" else _yf_ohlc(meta["sym"]))


@router.get("/realised/{pair}")
def realised(pair: str):
    """Day-of-week realised vol, implied weekend weight and the realised FOMC lump."""
    pair = pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    try:
        data = _load_history(pair)
        if not data or len(data["c"]) < 250:
            raise ValueError("not enough daily history")
        rep = realised_study(data["dates"], data["c"], _market(pair))
    except Exception as e:
        raise HTTPException(503, f"Price history unavailable: {e}")
    return _clean({"pair": pair, "market": _market(pair), **rep})


@router.get("/crypto/{currency}")
def crypto_fit(currency: str):
    """Fit base vol, weekend weight and event variances to the live Deribit ATM term structure."""
    currency = currency.upper()
    if currency not in ("BTC", "ETH"):
        raise HTTPException(404, "Live event-vol fit is available for BTC and ETH (Deribit).")
    from .vol import get_crypto_vol
    try:
        surf = get_crypto_vol(currency)
    except HTTPException as e:
        raise HTTPException(503, f"Deribit surface unavailable: {e.detail}")
    now = _now()
    exps = [{"time": datetime.fromisoformat(e["expiry"]).replace(hour=8, tzinfo=timezone.utc),
             "atm_vol": e["atm_vol"], "label": e["label"]}
            for e in surf["expiries"] if e.get("atm_vol") and e["days"] <= 200]
    exps = [e for e in exps if e["time"] > now + timedelta(hours=2)]
    events, source = calendar_events(now, 200)
    try:
        fit = fit_term_structure(now, exps, events, "crypto")
    except ValueError as e:
        raise HTTPException(503, f"Fit failed: {e}")
    spot = surf.get("index_price")
    mkt_pts = [(r["days"] / 365, r["market_vol"]) for r in fit["expiries"]]
    fwd = forward_vols(mkt_pts)
    for r, f in zip(fit["expiries"][1:], fwd):
        r["fwd_vol_market"], r["calendar_arb"] = f["fwd_vol"], f["arbitrage"]
    ev_var = fit["event_variance"]
    return _clean({
        "pair": f"{currency}USD", "spot": spot, "source": "Deribit ATM (SVI) + " + ", ".join(source),
        "fit": fit, "moves": event_moves(ev_var, fit["base_vol"], spot),
        "events": _ev_json([e for e in events if e["time"] <= exps[-1]["time"]]),
        "curve": _curve(now, fit["base_vol"], fit["weekend_weight"], events, ev_var, "crypto"),
        "tenors": _tenors(now, fit["base_vol"], fit["weekend_weight"], events, ev_var, "crypto"),
        "now": now.isoformat()})


class Quote(BaseModel):
    days: float = Field(..., gt=0.04, le=400)
    vol: float = Field(..., gt=0.005, lt=5)


class CustomEvent(BaseModel):
    type: str = Field(default="OTHER")
    name: str = Field(default="Custom event", max_length=60)
    time: datetime


class ModelRequest(BaseModel):
    pair: str = "XAUUSD"
    S: float | None = Field(default=None, gt=0)
    base_vol: float = Field(default=0.16, gt=0.005, lt=5, description="Weekday (ex-event) vol, ACT/365")
    weekend_weight: float = Field(default=0.2, ge=0, le=1.5)
    event_moves_pct: dict[str, float] = Field(default={"FOMC": 1.2, "CPI": 1.0, "NFP": 0.9, "OTHER": 0.8},
                                              description="Event 1-sd move in % per type")
    quotes: list[Quote] = Field(default=[], max_length=20, description="Optional ATM quotes to fit")
    custom_events: list[CustomEvent] = Field(default=[], max_length=20)
    include_calendar: bool = True
    fit_events: bool = Field(default=False, description="Free event lumps in the quote fit (needs dense quotes)")
    expiry_days: float | None = Field(default=None, gt=0.01, le=400, description="Calculator expiry")


@router.post("/model")
def model(req: ModelRequest):
    """Vol-time term structure for any pair: build from assumptions or fit to quoted ATM vols."""
    pair = req.pair.upper()
    if pair not in PAIRS:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    market = _market(pair)
    now = _now()
    events, source = calendar_events(now, 400) if req.include_calendar else ([], [])
    for ce in req.custom_events:
        t = ce.time if ce.time.tzinfo else ce.time.replace(tzinfo=timezone.utc)
        if t > now:
            events.append({"type": ce.type.upper() if ce.type.upper() in EVENT_TYPES else "OTHER",
                           "name": ce.name, "time": t})
    events.sort(key=lambda e: e["time"])
    ev_var = {k.upper(): (v / 100) ** 2 for k, v in req.event_moves_pct.items() if k.upper() in EVENT_TYPES and v >= 0}
    base, w, fit = req.base_vol, req.weekend_weight, None
    if len(req.quotes) >= 3:
        exps = [{"time": _cut(now + timedelta(days=q.days), market) if q.days >= 1 else now + timedelta(days=q.days),
                 "atm_vol": q.vol, "label": f"{q.days:g}d"} for q in req.quotes]
        last = max(e["time"] for e in exps)
        n_types = len({e["type"] for e in events if now < e["time"] <= last})
        # Sparse broker tenors cannot pin event lumps: hold them at the stated moves unless
        # the trader asks for a free fit and there are enough quotes to identify it.
        fix = None if (req.fit_events and len(exps) >= n_types + 2) else ev_var
        try:
            fit = fit_term_structure(now, exps, events, market, fix_w=req.weekend_weight, fix_events=fix)
            fit["events_fixed"] = fix is not None
        except ValueError as e:
            raise HTTPException(422, str(e))
        base = fit["base_vol"]
        # Fitted event types override assumptions only where the quotes identify them.
        ev_var = {**ev_var, **{t: v for t, v in fit["event_variance"].items() if fit["identified"].get(t)}}
        fwd = forward_vols([(r["days"] / 365, r["market_vol"]) for r in fit["expiries"]])
        for r, f in zip(fit["expiries"][1:], fwd):
            r["fwd_vol_market"], r["calendar_arb"] = f["fwd_vol"], f["arbitrage"]
    calc = None
    if req.expiry_days:
        end = now + timedelta(days=req.expiry_days)
        if req.expiry_days >= 1:
            end = _cut(end, market)
        calc = model_vol(now, end, base, w, events, ev_var, market)
        calc["expiry"] = end.isoformat()
    return _clean({
        "pair": pair, "market": market, "spot": req.S, "base_vol": base, "weekend_weight": w,
        "flat_calendar_vol": base * np.sqrt((5 + 2 * w) / 7), "event_variance": ev_var,
        "moves": event_moves(ev_var, base, req.S), "fit": fit, "calculator": calc,
        "events": _ev_json([e for e in events if e["time"] <= now + timedelta(days=95)]),
        "source": source, "curve": _curve(now, base, w, events, ev_var, market),
        "tenors": _tenors(now, base, w, events, ev_var, market), "now": now.isoformat()})


def _clean(obj):
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        return round(x, 8) if np.isfinite(x) else None
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [_clean(v) for v in obj]
    return obj
