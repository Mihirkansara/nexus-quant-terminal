"""
news.py — Free economic calendar from Forex Factory.

Source: nfs.faireconomy.media (official FF data mirror, JSON format)
  ff_calendar_thisweek.json  — current week
  (nextweek.json appears Fri/Sat only, gracefully skipped if 404)
  No API key. No auth.
"""

import httpx
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(prefix="/news", tags=["news"])

FF_JSON_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]

# In-memory cache — refresh every hour
_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL  = 3600   # seconds


def _fetch_ff_json(url: str) -> list[dict]:
    try:
        resp = httpx.get(
            url, timeout=15, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; QuantRiskFX/3.0)"}
        )
        if resp.status_code != 200:
            return []
        raw = resp.json()
        events = []
        for ev in (raw if isinstance(raw, list) else []):
            # `date` is already ISO-8601 with TZ offset, e.g. "2026-06-07T08:30:00-04:00"
            date_str = ev.get("date", "")
            dt_utc   = None
            if date_str:
                try:
                    dt_et  = datetime.fromisoformat(date_str)
                    dt_utc = dt_et.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
                except ValueError:
                    pass

            events.append({
                "title":        ev.get("title", "").strip(),
                "country":      ev.get("country", "").strip(),
                "date_raw":     date_str,
                "datetime_utc": dt_utc,
                "impact":       ev.get("impact", "").strip(),
                "forecast":     ev.get("forecast", "").strip(),
                "previous":     ev.get("previous", "").strip(),
                "actual":       ev.get("actual", "").strip(),
                "url":          "",
            })
        return events
    except Exception:
        return []


def _load_calendar() -> dict:
    import time
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["data"]

    seen:  set[tuple]  = set()
    all_events: list   = []
    for url in FF_JSON_URLS:
        for ev in _fetch_ff_json(url):
            key = (ev["title"], ev["country"], ev["datetime_utc"])
            if key not in seen:
                seen.add(key)
                all_events.append(ev)

    all_events.sort(key=lambda e: e["datetime_utc"] or "")

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    next_high = next(
        (e for e in all_events
         if e["impact"] == "High"
         and (e["datetime_utc"] or "") >= now_utc
         and not e["actual"]),
        None,
    )

    result = {
        "events":    all_events,
        "count":     len(all_events),
        "now_utc":   now_utc,
        "next_high": next_high,
        "source":    "Forex Factory Economic Calendar — nfs.faireconomy.media (free, no API key)",
        "note":      "Times in UTC (source is US Eastern Time).",
        "cached":    False,
    }
    _cache["data"] = result
    _cache["ts"]   = now
    return result


@router.get("/calendar")
def get_calendar():
    """
    Economic calendar from Forex Factory (current + next week).
    Times returned as UTC ISO-8601 strings. Cached for 1 hour.
    """
    result = _load_calendar()
    return {**result, "cached": _cache["ts"] > 0}
