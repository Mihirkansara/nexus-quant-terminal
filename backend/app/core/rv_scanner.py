"""
rv_scanner.py — Carry & relative-value scanner for Deribit BTC / ETH.

Carry
  Dated futures: annualised basis b = (F/S − 1) · 365/days (simple) against the index S.
  Perpetual: annualised funding = funding_8h × 3 × 365.
  Options-implied forward per expiry (Deribit's `underlying_price`, the synthetic forward the
  options are marked on) vs the listed future of the same expiry → forward-basis dislocation.

Relative value on the smile
  Raw SVI is fitted to each expiry's OTM mark IVs (Gatheral 2004); each option's residual
  r = σ_mark − σ_SVI is compared with its bid/ask in vol terms (bid/ask coin prices inverted with
  Black-76 on the forward). An option is flagged rich (sell) / cheap (buy) only when |r| exceeds
  half the bid/ask spread; edge in USD = (|r| − ½ spread) · vega per vol point.

Arbitrage / consistency checks (Deribit options are European, coin-settled):
  put-call parity in coin terms  C − P = (F − K)/F  (premium in coin, marked on the forward F);
  executable parity edge using ask for the leg bought and bid for the leg sold;
  static no-arbitrage on marks: call prices non-increasing and convex in strike
  (vertical-spread and butterfly bounds, Carr & Madan 2005).

Vol carry
  ATM vol per expiry against the 30-day realised vol of the perpetual → vol risk premium.

References:
    Gatheral, J. (2004). "A parsimonious arbitrage-free implied volatility parameterization".
    Carr, P. & Madan, D. (2005). "A note on sufficient conditions for no arbitrage", FRL 2(3).
    Black, F. (1976). "The pricing of commodity contracts".
"""

from collections import defaultdict

import numpy as np
from scipy.optimize import brentq
from scipy.stats import norm

from .vol_analytics import _svi_vol, fit_svi, parse_deribit_instrument

YEAR_MS = 365 * 86400 * 1000


def black76_coin(F, K, T, sigma, call):
    """Deribit-style premium in coin: Black-76 undiscounted USD value divided by the forward."""
    sq = sigma * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * sq * sq) / sq
    d2 = d1 - sq
    usd = F * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - F * norm.cdf(-d1)
    return usd / F


def implied_vol_coin(price, F, K, T, call):
    """Invert a coin premium to Black-76 vol; None if outside no-arbitrage bounds."""
    intrinsic = max((F - K) / F, 0) if call else max((K - F) / F, 0)
    upper = 1.0 if call else K / F
    if price is None or price <= intrinsic + 1e-10 or price >= upper:
        return None
    try:
        return float(brentq(lambda s: black76_coin(F, K, T, s, call) - price, 1e-4, 10.0, xtol=1e-8))
    except ValueError:
        return None


def carry_report(futures, index, now_ms):
    """Futures basis curve and perpetual funding."""
    rows, perp = [], None
    for f in futures:
        name = f.get("instrument_name", "")
        mark = f.get("mark_price")
        if not mark:
            continue
        if name.endswith("PERPETUAL"):
            f8 = f.get("funding_8h")
            perp = {"instrument": name, "mark": float(mark), "premium_pct": (float(mark) / index - 1) * 100,
                    "funding_8h": f8, "funding_annual": float(f8) * 3 * 365 if f8 is not None else None}
            continue
        try:
            from datetime import datetime, timezone
            exp = datetime.strptime(name.split("-")[1], "%d%b%y").replace(hour=8, tzinfo=timezone.utc)
        except (IndexError, ValueError):
            continue
        days = (exp.timestamp() * 1000 - now_ms) / 86400000
        if days <= 0.5:
            continue
        rows.append({"instrument": name, "expiry": exp.strftime("%Y-%m-%d"), "days": days, "mark": float(mark),
                     "basis_pct": (float(mark) / index - 1) * 100,
                     "basis_annual": (float(mark) / index - 1) * 365 / days})
    return {"index": index, "futures": sorted(rows, key=lambda r: r["days"]), "perpetual": perp}


def scan(options, index, now_ms, futures_curve=None, realised_30d=None, min_oi=0.0, max_days=200):
    """Smile residuals, executable edges, parity and static-arbitrage checks per expiry."""
    by_exp = defaultdict(list)
    for r in options:
        p = parse_deribit_instrument(r.get("instrument_name", ""))
        if not p:
            continue
        exp, K, cp = p
        T = (exp.timestamp() * 1000 - now_ms) / YEAR_MS
        F = r.get("underlying_price")
        iv = r.get("mark_iv")
        if T <= 1 / 365 or T * 365 > max_days or not F or not iv:
            continue
        by_exp[exp.strftime("%Y-%m-%d")].append({
            "name": r["instrument_name"], "K": float(K), "call": cp == "call", "F": float(F), "T": T,
            "iv": float(iv) / 100, "mark": r.get("mark_price"), "bid": r.get("bid_price"), "ask": r.get("ask_price"),
            "oi": float(r.get("open_interest") or 0)})
    fut_by_exp = {f["expiry"]: f for f in (futures_curve or {}).get("futures", [])}
    ideas, expiries, parity, arbs = [], [], [], []
    for e in sorted(by_exp):
        rows = by_exp[e]
        F = float(np.median([x["F"] for x in rows]))
        T = rows[0]["T"]
        otm = [x for x in rows if (x["call"] and x["K"] >= F) or (not x["call"] and x["K"] < F)]
        if len(otm) < 5:
            continue
        k = np.log(np.array([x["K"] for x in otm]) / F)
        params, rmse = fit_svi(k, np.array([x["iv"] for x in otm]), T)
        atm = _svi_vol(params, 0.0, T)
        res_rows = []
        for x in otm:
            kk = np.log(x["K"] / F)
            fit = _svi_vol(params, kk, T)
            resid = x["iv"] - fit
            bid_iv = implied_vol_coin(x["bid"], F, x["K"], T, x["call"]) if x["bid"] else None
            ask_iv = implied_vol_coin(x["ask"], F, x["K"], T, x["call"]) if x["ask"] else None
            half = (ask_iv - bid_iv) / 2 if (bid_iv and ask_iv and ask_iv > bid_iv) else None
            sq = x["iv"] * np.sqrt(T)
            d1 = (np.log(F / x["K"]) + 0.5 * sq * sq) / sq
            vega_pt = F * norm.pdf(d1) * np.sqrt(T) / 100              # USD per vol point per coin
            edge_vol = abs(resid) - (half or 0.0)
            row = {"instrument": x["name"], "expiry": e, "days": T * 365, "strike": x["K"], "type": "call" if x["call"] else "put",
                   "moneyness": float(kk), "mark_iv": x["iv"], "fit_iv": fit, "residual": resid,
                   "bid_iv": bid_iv, "ask_iv": ask_iv, "half_spread": half, "vega_usd_per_pt": vega_pt,
                   "edge_vol": edge_vol, "edge_usd": max(edge_vol, 0) * 100 * vega_pt, "oi": x["oi"]}
            res_rows.append(row)
            if edge_vol > 0 and x["oi"] >= min_oi and (half is not None or abs(resid) > 0.01):
                ideas.append({**row, "side": "sell (rich)" if resid > 0 else "buy (cheap)"})
        # Put-call parity per strike (both legs listed).
        legs = defaultdict(dict)
        for x in rows:
            legs[x["K"]]["C" if x["call"] else "P"] = x
        for K, lp in legs.items():
            if "C" not in lp or "P" not in lp or not lp["C"]["mark"] or not lp["P"]["mark"]:
                continue
            c, p = lp["C"], lp["P"]
            theo = (F - K)                                              # USD, forward-style (coin-settled)
            mark_dev = (c["mark"] - p["mark"]) * F - theo
            exe = None
            if c["ask"] and p["bid"] and c["bid"] and p["ask"]:
                long_syn = theo - (c["ask"] - p["bid"]) * F             # buy C, sell P, short forward
                short_syn = (c["bid"] - p["ask"]) * F - theo           # sell C, buy P, long forward
                exe = max(long_syn, short_syn)
            parity.append({"expiry": e, "strike": K, "mark_dev_usd": mark_dev, "mark_dev_bp": mark_dev / F * 1e4,
                           "executable_edge_usd": exe})
        # Static no-arbitrage on call marks; each flag also priced at the touch (buy at ask, sell at bid).
        calls = sorted([(x["K"], x["mark"] * F, (x["bid"] or 0) * F or None, (x["ask"] or 0) * F or None)
                        for x in rows if x["call"] and x["mark"]])

        def flag(kind, strikes, viol, exe):
            arbs.append({"expiry": e, "type": kind, "strikes": strikes, "violation_usd": viol,
                         "executable_usd": exe, "executable": bool(exe is not None and exe > 0)})
        for (k1, c1, b1, a1), (k2, c2, b2, a2) in zip(calls, calls[1:]):
            if c2 > c1 + 1e-9 * F:
                flag("vertical (call price rises with strike)", [k1, k2], c2 - c1, b2 - a1 if (b2 and a1) else None)
            if c1 - c2 > (k2 - k1) + 1e-9 * F:
                flag("vertical (spread > strike width)", [k1, k2], c1 - c2 - (k2 - k1),
                     b1 - a2 - (k2 - k1) if (b1 and a2) else None)
        for (k1, c1, b1, a1), (k2, c2, b2, a2), (k3, c3, b3, a3) in zip(calls, calls[1:], calls[2:]):
            w = (k3 - k2) / (k3 - k1)
            fly = w * c1 + (1 - w) * c3 - c2
            if fly < -1e-6 * F:
                flag("butterfly (convexity)", [k1, k2, k3], -fly,
                     b2 - w * a1 - (1 - w) * a3 if (a1 and b2 and a3) else None)
        fut = fut_by_exp.get(e)
        expiries.append({"expiry": e, "days": T * 365, "forward": F, "atm_iv": atm, "svi_rmse": rmse,
                         "forward_basis_annual": (F / index - 1) * 365 / (T * 365),
                         "future": fut["mark"] if fut else None,
                         "fwd_vs_future_bp": (F / fut["mark"] - 1) * 1e4 if fut else None,
                         "vrp": atm - realised_30d if realised_30d else None,
                         "residuals": res_rows})
    ideas.sort(key=lambda r: -r["edge_usd"])
    parity.sort(key=lambda r: -abs(r["mark_dev_usd"]))
    return {"expiries": expiries, "ideas": ideas[:25], "parity": parity[:25],
            "parity_max_executable": max((p["executable_edge_usd"] for p in parity if p["executable_edge_usd"] is not None), default=None),
            "static_arbitrage": sorted(arbs, key=lambda a: (not a["executable"], -a["violation_usd"])),
            "static_arbitrage_executable": int(sum(bool(a["executable"]) for a in arbs)), "realised_30d": realised_30d}
