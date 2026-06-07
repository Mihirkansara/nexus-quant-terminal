import time
import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/live", tags=["live"])

# Simple in-memory cache to avoid hammering free APIs
_cache: dict = {}
CACHE_TTL = 30  # seconds


def _cached(key: str, ttl: int = CACHE_TTL):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < ttl:
        return entry["data"]
    return None


def _store(key: str, data):
    _cache[key] = {"ts": time.time(), "data": data}
    return data


@router.get("/aircraft")
def get_aircraft():
    cached = _cached("aircraft", ttl=30)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get("https://opensky-network.org/api/states/all")
            r.raise_for_status()
            data = r.json()
            states = data.get("states") or []
            # Filter: has position, not on ground, limit 600
            filtered = [
                s for s in states
                if s[5] is not None and s[6] is not None and not s[8]
            ][:600]
            result = {"time": data.get("time"), "states": filtered}
            return _store("aircraft", result)
    except Exception as e:
        return {"time": None, "states": [], "error": str(e)}


@router.get("/earthquakes")
def get_earthquakes():
    cached = _cached("earthquakes", ttl=300)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
            )
            r.raise_for_status()
            return _store("earthquakes", r.json())
    except Exception as e:
        return {"features": [], "error": str(e)}
