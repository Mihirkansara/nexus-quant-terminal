"""
event_vol.py — Event & weekend volatility: "vol time" term-structure model.

Desks do not price short-dated options on calendar time. Each hour to expiry carries
a variance weight: 1 for a normal weekday hour, w_we for a weekend hour (≈0.1–0.3 for
FX/metals whose spot is shut, ≈0.5–0.9 for 24/7 crypto), and each scheduled event
(FOMC, CPI, NFP, ECB, BoJ…) adds a lump of variance v_e on its timestamp:

    σ_ATM(T)² · T  =  σ_b² · τ(T)  +  Σ_{events e before T} v_e,
    τ(T) = (1/8760) · Σ_{hours h in (now, T]} weight(h)          (ACT/365 hours)

σ_b is the weekday ("base", ex-event) vol in ACT/365 units, and √v_e is the event's
own 1-sd move. Given listed expiries the model is linear in (σ_b², v_type) for a fixed
weekend weight, so it is fitted by non-negative least squares on total variance with
a grid search over w_we. Forward vols between expiries follow from additivity of
variance; a negative forward variance is a calendar arbitrage.

References:
    Castagna, A. (2010). FX Options and Smile Risk, ch. 6 (event and weekend weighting).
    Clark, I. (2011). Foreign Exchange Option Pricing, §3.6 "Volatility time".
    Wystup, U. (2017). FX Options and Structured Products, §1.5 (overnight vols).
    Dubinsky, Johannes, Kaeck & Seeger (2019). "Option pricing of earnings announcement
        risks", Review of Financial Studies 32(2) — event-variance stripping from the term
        structure.
    Gatheral, J. (2006). The Volatility Surface, ch. 1 (calendar arbitrage: total implied
        variance must be non-decreasing in T).
"""

from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.optimize import nnls

HOURS_PER_YEAR = 365 * 24

# Scheduled release times (UTC). US events move with US daylight saving.
# FOMC 2026 (decision day, 14:00 ET) — federalreserve.gov calendar.
FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29",
             "2026-09-16", "2026-10-28", "2026-12-09"]
FOMC_PAST = ["2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18",
             "2024-11-07", "2024-12-18", "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
             "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10"]
# Remaining 2026 US data releases known at build time (BLS schedule, 08:30 ET).
CPI_2026 = ["2026-10-14", "2026-11-12", "2026-12-10"]
NFP_2026 = ["2026-11-06", "2026-12-04"]

EVENT_TYPES = ("FOMC", "CPI", "NFP", "OTHER")


def _us_dst(d: datetime) -> bool:
    """US daylight saving: second Sunday of March → first Sunday of November."""
    y = d.year
    mar = datetime(y, 3, 8, tzinfo=timezone.utc)
    start = mar + timedelta(days=(6 - mar.weekday()) % 7)
    nov = datetime(y, 11, 1, tzinfo=timezone.utc)
    end = nov + timedelta(days=(6 - nov.weekday()) % 7)
    return start <= d < end


def et_to_utc(date_str: str, hour_et: float) -> datetime:
    d = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    offset = 4 if _us_dst(d) else 5
    return d + timedelta(hours=hour_et + offset)


def default_events(now: datetime, horizon_days: float = 120) -> list:
    """Built-in US calendar (FOMC 14:00 ET, CPI/NFP 08:30 ET) within the horizon."""
    out = []
    for t, dates, hr in (("FOMC", FOMC_2026, 14.0), ("CPI", CPI_2026, 8.5), ("NFP", NFP_2026, 8.5)):
        for d in dates:
            ts = et_to_utc(d, hr)
            if now < ts <= now + timedelta(days=horizon_days):
                out.append({"type": t, "name": f"US {t}", "time": ts})
    return sorted(out, key=lambda e: e["time"])


def classify_ff_event(title: str, country: str):
    """Map a Forex Factory high-impact title to an event type (None = ignore)."""
    t = title.lower()
    if country == "USD":
        if "federal funds rate" in t or "fomc statement" in t:
            return "FOMC"
        if t.startswith("cpi") or "core cpi" in t:
            return "CPI"
        if "non-farm" in t:
            return "NFP"
    if country in ("EUR", "JPY", "GBP") and ("rate" in t and ("main refinancing" in t or "policy rate" in t
                                                             or "official bank rate" in t)):
        return "OTHER"
    return None


def is_weekend(ts: datetime, market: str = "fx") -> bool:
    """
    Weekend hours. FX/metals: Fri 21:00 UTC → Sun 21:00 UTC (spot closed).
    Crypto: Saturday and Sunday UTC (market open but thinner).
    """
    wd, h = ts.weekday(), ts.hour
    if market == "crypto":
        return wd >= 5
    return (wd == 4 and h >= 21) or wd == 5 or (wd == 6 and h < 21)


def hour_grid(now: datetime, end: datetime, market: str):
    """Hourly grid (now, end]: weekend flags and the fraction of each hour used."""
    n = max(0, int(np.ceil((end - now).total_seconds() / 3600)))
    starts = [now + timedelta(hours=i) for i in range(n)]
    frac = np.ones(n)
    if n:
        frac[-1] = ((end - now).total_seconds() / 3600) - (n - 1)
    we = np.array([is_weekend(s, market) for s in starts], dtype=bool)
    return we, frac


def vol_time(now: datetime, end: datetime, w_we: float, market: str) -> tuple:
    """(τ in weighted years, weekday-hour years, weekend-hour years)."""
    we, frac = hour_grid(now, end, market)
    wk = float(frac[~we].sum()) / HOURS_PER_YEAR
    wkend = float(frac[we].sum()) / HOURS_PER_YEAR
    return wk + w_we * wkend, wk, wkend


def _design(now, expiries, events, w_we, market, types):
    rows = []
    for e in expiries:
        tau, _, _ = vol_time(now, e["time"], w_we, market)
        counts = [sum(1 for ev in events if ev["type"] == t and now < ev["time"] <= e["time"]) for t in types]
        rows.append([tau] + counts)
    return np.array(rows, float)


def fit_term_structure(now, expiries, events, market="crypto", w_grid=None, fix_w=None,
                       event_floor=None, fix_events=None):
    """
    Fit σ_b, w_we and per-type event variances to listed ATM vols.
    expiries: [{"time": datetime, "atm_vol": σ, "label": str}], events: [{"type","time",...}].
    event_floor: optional {type: min variance} prior (e.g. from realised history) — types
    whose window holds no expiry pair are otherwise unidentified and left at the floor.
    fix_events: {type: variance} held fixed (only σ_b, and w_we unless fixed, are fitted) —
    used when there are too few quotes to identify event lumps.
    """
    exps = sorted([e for e in expiries if e["time"] > now], key=lambda e: e["time"])
    if len(exps) < 3:
        raise ValueError("need at least 3 future expiries")
    T = np.array([(e["time"] - now).total_seconds() / 3600 / HOURS_PER_YEAR for e in exps])
    target = np.array([e["atm_vol"] ** 2 for e in exps]) * T
    types = [t for t in EVENT_TYPES if any(ev["type"] == t and now < ev["time"] <= exps[-1]["time"] for ev in events)]
    wts = 1.0 / np.maximum(target, 1e-8)                 # relative error in total variance ≈ 2× vol error
    floor = np.array([(event_floor or {}).get(t, 0.0) for t in types])
    if fix_events is not None:
        floor = np.array([fix_events.get(t, 0.0) for t in types])
    grid = [fix_w] if fix_w is not None else (w_grid if w_grid is not None else np.round(np.arange(0.0, 1.21, 0.05), 2))
    best = None
    for w in grid:
        A = _design(now, exps, events, w, market, types)
        # Event variance above the floor is the free (non-negative) unknown.
        b = target - (A[:, 1:] @ floor if len(types) else 0.0)
        sw = np.sqrt(wts)
        if fix_events is not None:
            x0, _ = nnls(A[:, :1] * sw[:, None], b * sw)
            x = np.concatenate([x0, np.zeros(len(types))])
        else:
            x, _ = nnls(A * sw[:, None], b * sw)
        x[1:] += floor
        fit = A @ x
        sse = float(np.sum(wts * (fit - target) ** 2))
        if best is None or sse < best[0]:
            best = (sse, w, x, A, fit)
    sse, w, x, A, fit = best
    base_var = x[0]
    ev_var = dict(zip(types, x[1:].tolist()))
    # Identification: an event type is pinned only if some consecutive expiry pair brackets it.
    ident = {}
    for t in ([] if fix_events is not None else types):
        ident[t] = any(any(ev["type"] == t and exps[i]["time"] < ev["time"] <= exps[i + 1]["time"] for ev in events)
                       for i in range(len(exps) - 1)) or any(ev["type"] == t and now < ev["time"] <= exps[0]["time"] for ev in events)
    model_vol = np.sqrt(fit / T)
    rows = []
    for i, e in enumerate(exps):
        rows.append({"label": e.get("label"), "time": e["time"].isoformat(), "days": float(T[i] * 365),
                     "market_vol": float(e["atm_vol"]), "model_vol": float(model_vol[i]),
                     "error_vol": float(model_vol[i] - e["atm_vol"]),
                     "event_share": float((A[i, 1:] @ x[1:]) / fit[i]) if fit[i] > 0 and len(types) else 0.0,
                     "events_before": int(A[i, 1:].sum()) if len(types) else 0})
    return {"base_vol": float(np.sqrt(base_var)), "weekend_weight": float(w),
            "event_variance": ev_var, "identified": ident,
            "rmse_vol": float(np.sqrt(np.mean((model_vol - np.array([e["atm_vol"] for e in exps])) ** 2))),
            "expiries": rows, "market": market}


def model_vol(now, end, base_vol, w_we, events, ev_var, market):
    """Model ATM vol to an arbitrary expiry and its variance decomposition."""
    T = (end - now).total_seconds() / 3600 / HOURS_PER_YEAR
    if T <= 0:
        raise ValueError("expiry must be in the future")
    _, wk, wkend = vol_time(now, end, w_we, market)
    inside = [ev for ev in events if now < ev["time"] <= end]
    v_wk, v_we = base_vol ** 2 * wk, base_vol ** 2 * w_we * wkend
    v_ev = sum(ev_var.get(ev["type"], 0.0) for ev in inside)
    tot = v_wk + v_we + v_ev
    return {"T": T, "days": T * 365, "vol": float(np.sqrt(tot / T)),
            "flat_calendar_vol": float(base_vol * np.sqrt((5 + 2 * w_we) / 7)),
            "share": {"weekday": v_wk / tot, "weekend": v_we / tot, "events": v_ev / tot},
            "events": [{"type": ev["type"], "name": ev.get("name", ev["type"]), "time": ev["time"].isoformat()} for ev in inside]}


def forward_vols(points):
    """Forward vols between consecutive (T, vol) points; flags negative forward variance."""
    out = []
    pts = sorted(points)
    for (t0, v0), (t1, v1) in zip(pts[:-1], pts[1:]):
        fv = v1 ** 2 * t1 - v0 ** 2 * t0
        out.append({"T0": t0, "T1": t1, "fwd_var": fv,
                    "fwd_vol": float(np.sqrt(fv / (t1 - t0))) if fv > 0 else None, "arbitrage": bool(fv < 0)})
    return out


def event_moves(ev_var, base_vol, spot, w_we=1.0):
    """Event-day 1-sd move (base day + event lump), expected |move| and straddle breakeven."""
    day = base_vol ** 2 / 365
    out = {}
    for t, v in ev_var.items():
        sd = np.sqrt(day + v)
        out[t] = {"event_sd_pct": float(np.sqrt(v) * 100), "day_sd_pct": float(sd * 100),
                  "normal_day_sd_pct": float(np.sqrt(day) * 100), "multiple_of_normal_day": float(sd / np.sqrt(day)) if day > 0 else None,
                  "expected_abs_move_pct": float(np.sqrt(2 / np.pi) * sd * 100),
                  "expected_abs_move": float(np.sqrt(2 / np.pi) * sd * spot) if spot else None}
    return out


# ─── Realised study ───────────────────────────────────────────────────────────

def realised_study(dates, closes, market="fx", fomc_dates=FOMC_PAST + FOMC_2026):
    """
    Day-of-week realised variance profile, implied weekend weight and the FOMC lump.

    FX/metals daily closes: Monday's return spans the weekend, so
        w_we ≈ (var_Mon − var_weekday) / (2 · var_weekday)    (2 weekend days).
    Crypto: Saturday/Sunday returns are observed directly, w_we = var_weekend / var_weekday.
    FOMC (14:00 ET) lands after many daily closes (CME gold settles 13:30 ET), so the event
    window is the 2-day return over the decision day and the next day:
        v_FOMC ≈ E[r²_2d] − 2 · var_weekday.
    """
    d = [datetime.fromisoformat(str(x)[:10]) for x in dates]
    c = np.asarray(closes, float)
    r = np.diff(np.log(c))
    d1 = d[1:]
    wd = np.array([x.weekday() for x in d1])
    # Robust to outliers: winsorise at 6 sd before the variance profile.
    s = np.std(r)
    rw = np.clip(r, -6 * s, 6 * s)
    fomc = {datetime.fromisoformat(x).date() for x in fomc_dates}
    idx_by_date = {x.date(): i for i, x in enumerate(d1)}
    ev_idx = set()
    windows = []
    for f in sorted(fomc):
        i = idx_by_date.get(f)
        if i is None or i + 1 >= len(r):
            continue
        ev_idx.update({i, i + 1})
        windows.append({"date": f.isoformat(), "move_2d_pct": float((r[i] + r[i + 1]) * 100)})
    mask_clean = np.array([i not in ev_idx for i in range(len(r))])
    prof = []
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for k in range(7):
        m = (wd == k) & mask_clean
        if m.sum() >= 10:
            prof.append({"day": names[k], "n": int(m.sum()), "vol_ann": float(np.sqrt(np.mean(rw[m] ** 2) * 365) )})
    if market == "crypto":
        wk = (wd < 5) & mask_clean
        we = (wd >= 5) & mask_clean
        v_wk = float(np.mean(rw[wk] ** 2))
        w_we = float(np.mean(rw[we] ** 2) / v_wk) if we.sum() > 10 else None
    else:
        mid = np.isin(wd, [1, 2, 3, 4]) & mask_clean
        mon = (wd == 0) & mask_clean
        v_wk = float(np.mean(rw[mid] ** 2))
        w_we = float(max(0.0, (np.mean(rw[mon] ** 2) - v_wk) / (2 * v_wk))) if mon.sum() > 10 else None
    if windows:
        m2 = np.array([w["move_2d_pct"] / 100 for w in windows])
        v_f = float(max(0.0, np.mean(m2 ** 2) - 2 * v_wk))
        fomc_stats = {"n": len(windows), "event_sd_pct": float(np.sqrt(v_f) * 100),
                      "avg_abs_2d_move_pct": float(np.mean(np.abs(m2)) * 100),
                      "normal_2d_sd_pct": float(np.sqrt(2 * v_wk) * 100), "event_variance": v_f,
                      "recent": windows[-8:]}
    else:
        fomc_stats = None
    return {"weekday_vol_ann": float(np.sqrt(v_wk * 365)), "weekend_weight": w_we,
            "day_of_week": prof, "fomc": fomc_stats, "n_returns": int(len(r)),
            "start": d[0].date().isoformat(), "end": d[-1].date().isoformat()}
