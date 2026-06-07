from fastapi import APIRouter

router = APIRouter(prefix="/strategies", tags=["strategies"])

# Pre-built strategy templates — all expressed relative to ATM spot (K=100 placeholder)
STRATEGIES = [
    {
        "name": "Long Call",
        "description": "Bullish. Unlimited upside, limited downside to premium paid.",
        "legs": [{"type": "call", "K_offset": 0, "qty": 1}],
    },
    {
        "name": "Long Put",
        "description": "Bearish. Profit if spot falls below strike.",
        "legs": [{"type": "put", "K_offset": 0, "qty": 1}],
    },
    {
        "name": "Covered Call",
        "description": "Long stock + short OTM call. Income strategy.",
        "legs": [{"type": "call", "K_offset": 5, "qty": -1}],
    },
    {
        "name": "Protective Put",
        "description": "Long stock + long put. Portfolio insurance.",
        "legs": [{"type": "put", "K_offset": -5, "qty": 1}],
    },
    {
        "name": "Straddle",
        "description": "Long call + put at same strike. Profits from large moves either way.",
        "legs": [
            {"type": "call", "K_offset": 0, "qty": 1},
            {"type": "put",  "K_offset": 0, "qty": 1},
        ],
    },
    {
        "name": "Strangle",
        "description": "OTM call + OTM put. Cheaper than straddle, needs bigger move.",
        "legs": [
            {"type": "call", "K_offset": 5,  "qty": 1},
            {"type": "put",  "K_offset": -5, "qty": 1},
        ],
    },
    {
        "name": "Bull Call Spread",
        "description": "Long ATM call + short OTM call. Capped upside, lower cost.",
        "legs": [
            {"type": "call", "K_offset": 0,  "qty": 1},
            {"type": "call", "K_offset": 10, "qty": -1},
        ],
    },
    {
        "name": "Bear Put Spread",
        "description": "Long ATM put + short OTM put. Profits from moderate decline.",
        "legs": [
            {"type": "put", "K_offset": 0,   "qty": 1},
            {"type": "put", "K_offset": -10, "qty": -1},
        ],
    },
    {
        "name": "Iron Condor",
        "description": "4-leg strategy. Profit from low volatility, defined risk.",
        "legs": [
            {"type": "put",  "K_offset": -15, "qty": 1},
            {"type": "put",  "K_offset": -5,  "qty": -1},
            {"type": "call", "K_offset": 5,   "qty": -1},
            {"type": "call", "K_offset": 15,  "qty": 1},
        ],
    },
    {
        "name": "Butterfly",
        "description": "3-strike spread. Max profit when spot pins at middle strike.",
        "legs": [
            {"type": "call", "K_offset": -10, "qty": 1},
            {"type": "call", "K_offset": 0,   "qty": -2},
            {"type": "call", "K_offset": 10,  "qty": 1},
        ],
    },
]


@router.get("")
def list_strategies():
    """Return all available strategy templates."""
    return STRATEGIES


@router.get("/{name}")
def get_strategy(name: str):
    """Return a specific strategy by name (case-insensitive)."""
    for s in STRATEGIES:
        if s["name"].lower() == name.lower():
            return s
    return {"error": f"Strategy '{name}' not found."}
