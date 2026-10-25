"""
newscenter.py — ForexFactory-style news center.

  • Aggregates free RSS feeds (FXStreet, Investing.com, MarketWatch,
    CNBC, Google News finance queries) — no API keys.
  • AI analysis per article: sentiment, impact, confidence,
    affected currencies/pairs, trading bias (rule-based NLP engine —
    deterministic, zero-latency, no external LLM dependency).
  • Economic event detection: FED/FOMC/NFP/CPI/ECB/… keyword engine.
  • Trading signal engine: high-impact + directional sentiment → signal card.

Storage: in-memory ring buffer (max 200 articles), deduped by title hash.
Upstream refresh at most every 60s; clients can poll every 10s for free.
"""

import re
import time
import html
import hashlib
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/newscenter", tags=["newscenter"])

UA = {"User-Agent": "Mozilla/5.0 (compatible; NexusTerminal/1.0)"}

FEEDS = [
    ("FXStreet",      "https://www.fxstreet.com/rss/news"),
    ("Investing.com", "https://www.investing.com/rss/news_1.rss"),
    ("MarketWatch",   "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("CNBC",          "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258"),
    ("Google News",   "https://news.google.com/rss/search?q=forex%20OR%20%22federal%20reserve%22%20OR%20%22interest%20rate%22&hl=en-US&gl=US&ceid=US:en"),
]

# ── Economic event keyword engine ─────────────────────────────────────────────
HIGH_IMPACT = [
    "fed ", "fomc", "nfp", "nonfarm", "non-farm", "cpi", "ppi", "gdp",
    "ecb", "boe ", "boj ", "snb ", "rba ", "rbnz", "rate decision",
    "rate cut", "rate hike", "interest rate", "inflation", "unemployment",
    "payrolls", "powell", "lagarde", "central bank", "monetary policy",
    "recession", "intervention", "emergency",
]
MED_IMPACT = [
    "retail sales", "pmi", "consumer confidence", "trade balance",
    "housing", "jobless claims", "durable goods", "treasury", "yields",
    "earnings", "manufacturing", "sentiment", "ism ", "tariff",
]

CCY_TERMS = {
    "USD": ["usd", "dollar", "fed ", "fomc", "powell", "treasury", "u.s.", "us economy", "american"],
    "EUR": ["eur", "euro", "ecb", "lagarde", "eurozone", "germany", "german"],
    "GBP": ["gbp", "pound", "sterling", "boe ", "bank of england", "uk ", "britain"],
    "JPY": ["jpy", "yen", "boj ", "bank of japan", "japan"],
    "CHF": ["chf", "franc", "snb ", "swiss"],
    "AUD": ["aud", "aussie", "rba ", "australia"],
    "CAD": ["cad", "loonie", "bank of canada", "canada"],
    "NZD": ["nzd", "kiwi", "rbnz", "new zealand"],
    "XAU": ["gold", "xau", "bullion"],
    "BTC": ["bitcoin", "btc", "crypto"],
}

BULLISH = ["hike", "raise", "strong", "beat", "beats", "surge", "rally", "soar",
           "jump", "gain", "growth", "robust", "hawkish", "record high", "upbeat",
           "optimis", "recover", "boost", "tops", "exceed"]
BEARISH = ["cut", "weak", "miss", "misses", "fall", "drop", "plunge", "slump",
           "decline", "recession", "dovish", "fear", "concern", "warn", "crisis",
           "tumble", "slide", "low", "downgrade", "risk-off", "selloff"]

PAIR_MAP = {
    "USD": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF"],
    "EUR": ["EURUSD", "EURJPY", "EURGBP"],
    "GBP": ["GBPUSD", "GBPJPY", "EURGBP"],
    "JPY": ["USDJPY", "EURJPY", "GBPJPY"],
    "CHF": ["USDCHF"],
    "AUD": ["AUDUSD"],
    "CAD": ["USDCAD"],
    "NZD": ["NZDUSD"],
    "XAU": ["XAUUSD"],
    "BTC": ["BTCUSD"],
}

_store: dict = {"articles": [], "ts": 0.0}
_REFRESH_TTL = 60     # upstream refresh interval (s)
_MAX_ARTICLES = 200


# ── RSS parsing (stdlib only) ─────────────────────────────────────────────────

def _text(el, tag):
    node = el.find(tag)
    return (node.text or "").strip() if node is not None and node.text else ""


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(s or "")).strip()


def _find_image(item) -> str:
    ns = {"media": "http://search.yahoo.com/mrss/"}
    for path in ("media:content", "media:thumbnail"):
        node = item.find(path, ns)
        if node is not None and node.get("url"):
            return node.get("url")
    enc = item.find("enclosure")
    if enc is not None and (enc.get("type") or "").startswith("image"):
        return enc.get("url", "")
    desc = _text(item, "description")
    m = re.search(r'<img[^>]+src="([^"]+)"', desc or "")
    return m.group(1) if m else ""


def _fetch_feed(source: str, url: str) -> list[dict]:
    try:
        resp = httpx.get(url, timeout=12, follow_redirects=True, headers=UA)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.content)
        out = []
        for item in root.iter("item"):
            title = _strip_html(_text(item, "title"))
            if not title:
                continue
            pub = _text(item, "pubDate")
            try:
                published = parsedate_to_datetime(pub).timestamp() if pub else time.time()
            except Exception:
                published = time.time()
            out.append({
                "id": hashlib.md5(title.lower().encode()).hexdigest()[:12],
                "title": title,
                "summary": _strip_html(_text(item, "description"))[:280],
                "image": _find_image(item),
                "source": source,
                "url": _text(item, "link"),
                "publishedAt": published,
            })
        return out[:40]
    except Exception:
        return []


# ── AI analysis engine ────────────────────────────────────────────────────────

def _detect_impact(text: str) -> str:
    t = " " + text.lower() + " "
    if any(k in t for k in HIGH_IMPACT):
        return "High"
    if any(k in t for k in MED_IMPACT):
        return "Medium"
    return "Low"


def _analyze(article: dict) -> dict:
    text = " " + (article["title"] + " " + article["summary"]).lower() + " "

    impact = _detect_impact(text)

    # Currency detection
    currencies = [ccy for ccy, terms in CCY_TERMS.items()
                  if any(term in text for term in terms)]

    bull = sum(text.count(w) for w in BULLISH)
    bear = sum(text.count(w) for w in BEARISH)

    if bull > bear:
        sentiment, score = "Bullish", bull - bear
    elif bear > bull:
        sentiment, score = "Bearish", bear - bull
    else:
        sentiment, score = "Neutral", 0

    confidence = min(95, 50 + score * 12 + (15 if impact == "High" else 5 if impact == "Medium" else 0))

    primary = currencies[0] if currencies else None
    pairs = []
    for ccy in currencies[:3]:
        pairs += PAIR_MAP.get(ccy, [])
    pairs = list(dict.fromkeys(pairs))[:5]

    if sentiment == "Neutral" or not primary:
        bias = "No directional bias — monitor for confirmation."
    else:
        bias = f"{sentiment} {primary} — watch {', '.join(pairs[:3]) if pairs else 'majors'} for {('continuation' if impact != 'High' else 'volatility expansion')}."

    return {
        "sentiment": sentiment if not primary else f"{sentiment} {primary}",
        "impact": impact,
        "confidence": confidence,
        "affectedCurrencies": currencies[:4],
        "affectedPairs": pairs,
        "tradingBias": bias,
    }


def _make_signal(article: dict) -> dict | None:
    ai = article["ai"]
    if ai["impact"] != "High" or "Neutral" in ai["sentiment"] or not ai["affectedPairs"]:
        return None
    pair = ai["affectedPairs"][0]
    bullish = ai["sentiment"].startswith("Bullish")
    ccy = ai["affectedCurrencies"][0] if ai["affectedCurrencies"] else ""
    # Bullish base currency → BUY the pair if ccy is the base, SELL if quote
    side = "BUY" if (bullish == pair.startswith(ccy)) else "SELL"
    return {
        "signal": side,
        "pair": pair,
        "strength": "Strong" if ai["confidence"] >= 80 else "Moderate",
        "confidence": ai["confidence"],
        "reason": article["title"][:90],
        "source": article["source"],
        "publishedAt": article["publishedAt"],
    }


# ── Aggregation ───────────────────────────────────────────────────────────────

def _refresh():
    now = time.time()
    if _store["articles"] and (now - _store["ts"]) < _REFRESH_TTL:
        return

    existing = {a["id"] for a in _store["articles"]}
    fresh = []
    for source, url in FEEDS:
        for art in _fetch_feed(source, url):
            if art["id"] not in existing:
                art["ai"] = _analyze(art)
                fresh.append(art)
                existing.add(art["id"])

    merged = fresh + _store["articles"]
    merged.sort(key=lambda a: -a["publishedAt"])
    _store["articles"] = merged[:_MAX_ARTICLES]
    _store["ts"] = now


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/feed")
def news_feed(limit: int = 30, offset: int = 0):
    """Paginated news feed with embedded AI analysis (infinite-scroll friendly)."""
    _refresh()
    arts = _store["articles"]
    return {
        "articles": arts[offset:offset + max(1, min(limit, 100))],
        "total": len(arts),
        "offset": offset,
        "refreshed_at": _store["ts"],
    }


@router.get("/hot")
def hot_story():
    """Top story: most recent High-impact article (prefers one with an image)."""
    _refresh()
    arts = _store["articles"]
    high = [a for a in arts if a["ai"]["impact"] == "High"]
    with_img = [a for a in high if a["image"]] or [a for a in arts if a["image"]]
    pick = (with_img or high or arts or [None])[0]
    return {"story": pick}


@router.get("/breaking")
def breaking():
    """High-impact stories from the last 20 minutes."""
    _refresh()
    cutoff = time.time() - 20 * 60
    items = [a for a in _store["articles"]
             if a["ai"]["impact"] == "High" and a["publishedAt"] >= cutoff]
    return {"breaking": items[:5]}


@router.get("/signals")
def news_signals():
    """Trading signal cards generated from recent high-impact news."""
    _refresh()
    cutoff = time.time() - 6 * 3600
    sigs = []
    seen_pairs = set()
    for a in _store["articles"]:
        if a["publishedAt"] < cutoff:
            break
        s = _make_signal(a)
        if s and s["pair"] not in seen_pairs:
            seen_pairs.add(s["pair"])
            sigs.append(s)
    return {"signals": sigs[:8]}
