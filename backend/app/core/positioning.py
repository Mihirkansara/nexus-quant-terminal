"""
positioning.py — Options positioning from Deribit open interest: dealer gamma exposure (GEX),
gamma-flip level, call / put walls, vanna and charm flows, max pain and implied moves per
expiry for BTC and ETH.

Greeks are Black-76 on each expiry's forward (Deribit options are coin-settled; r ≈ 0 on
the forward), with the mark implied vol of each strike (sticky-strike when spot is moved):
    Γ   = φ(d1) / (F σ √T)                         per 1 coin of underlying
    vanna = ∂Δ/∂σ = −φ(d1) d2 / σ
    charm = −∂Δ/∂T per day = φ(d1) d2 / (2T) / 365   (delta drift as time passes)
Dealer exposure needs an assumption about who is short the options. Two conventions:
    "classic" (SpotGamma): dealers long calls (sold to them by overwriters / covered-call
              vaults), short puts (bought by hedgers): sign +1 calls, −1 puts.
    "short_all": customers net long all options, dealers short both: sign −1.
GEX in USD per 1 % spot move:  GEX = Σ sign · Γ · OI · S² · 0.01  (OI in coins).
The gamma flip is where the re-computed total GEX crosses zero as spot moves (SpotGamma
methodology); above it dealers' hedging dampens moves (mean reversion), below it amplifies
them (trend / vol expansion).

Max pain (per expiry) = the settlement price minimising the intrinsic value paid to option
holders, a folk heuristic for expiry pinning that only bites when dealers are long gamma.

References:
    Black, F. (1976). "The pricing of commodity contracts", J. Financial Economics 3.
    SpotGamma, "Gamma Exposure (GEX)" methodology notes; FlashAlpha, "How to calculate GEX".
    Barbon, A. & Buraschi, A. (2021). "Gamma fragility", working paper (dealer gamma and
        intraday momentum / reversal).
"""

from collections import defaultdict

import numpy as np
from scipy.stats import norm

from .vol_analytics import parse_deribit_instrument

SECONDS_PER_YEAR = 365 * 86400


def parse_book(summaries, now_ms, max_days=120):
    """Rows of (expiry, T, K, is_call, iv, oi, F) from Deribit book summaries."""
    rows = []
    for r in summaries:
        p = parse_deribit_instrument(r.get("instrument_name", ""))
        iv, F, oi = r.get("mark_iv"), r.get("underlying_price"), r.get("open_interest")
        if not p or not iv or not F or iv <= 0 or F <= 0 or oi is None:
            continue
        exp, K, cp = p
        T = (exp.timestamp() * 1000 - now_ms) / 1000 / SECONDS_PER_YEAR
        if T <= 0 or T * 365 > max_days:
            continue
        rows.append((exp.strftime("%Y-%m-%d"), max(T, 1 / 8760), float(K), cp == "call",
                     float(iv) / 100, float(oi), float(F)))
    return rows


def _greeks(S_over_F_scale, T, K, iv, F):
    """Gamma, vanna, charm (per day) and call delta at forward F·scale (arrays)."""
    Fs = F * S_over_F_scale
    sq = iv * np.sqrt(T)
    d1 = (np.log(Fs / K) + 0.5 * sq ** 2) / sq
    d2 = d1 - sq
    pdf = norm.pdf(d1)
    gamma = pdf / (Fs * sq)
    vanna = -pdf * d2 / iv
    charm = pdf * d2 / (2 * T) / 365
    return gamma, vanna, charm, norm.cdf(d1)


def _signs(is_call, convention):
    if convention == "short_all":
        return -np.ones_like(is_call, dtype=float)
    return np.where(is_call, 1.0, -1.0)


def positioning_report(summaries, now_ms, spot, convention="classic", max_days=120, grid_pct=25):
    rows = parse_book(summaries, now_ms, max_days)
    if not rows:
        raise ValueError("no options with open interest in the horizon")
    exp, T, K, call, iv, oi, F = map(np.array, zip(*rows))
    sign = _signs(call, convention)

    gamma, vanna, charm, dcall = _greeks(1.0, T, K, iv, F)
    gex = sign * gamma * oi * spot ** 2 * 0.01                 # USD per 1 % move
    vex = sign * vanna * oi * spot * 0.01                      # USD of delta per +1 vol pt
    cex = sign * charm * oi * spot                             # USD of delta per day
    dex = sign * np.where(call, dcall, dcall - 1) * oi * spot  # USD delta held by dealers

    # Per-strike aggregation across expiries.
    by_k = defaultdict(lambda: {"call_oi": 0.0, "put_oi": 0.0, "call_gex": 0.0, "put_gex": 0.0})
    for k_, c_, o_, g_ in zip(K, call, oi, gex):
        d = by_k[float(k_)]
        d["call_oi" if c_ else "put_oi"] += o_
        d["call_gex" if c_ else "put_gex"] += g_
    lo, hi = spot * (1 - grid_pct / 100), spot * (1 + grid_pct / 100)
    strikes = sorted(k for k in by_k if lo <= k <= hi)
    strike_rows = [{"strike": k, **by_k[k], "net_gex": by_k[k]["call_gex"] + by_k[k]["put_gex"]} for k in strikes]

    # Gamma profile across hypothetical spot levels (forwards scale with spot, IV sticky-strike).
    grid = np.linspace(lo, hi, 121)
    profile = []
    for s in grid:
        g, *_ = _greeks(s / spot, T, K, iv, F)
        profile.append(float((sign * g * oi * s ** 2 * 0.01).sum()))
    profile = np.array(profile)
    flip = None
    cross = np.where(np.diff(np.sign(profile)) != 0)[0]
    if len(cross):
        # The crossing nearest to spot.
        i = cross[np.argmin(np.abs(grid[cross] - spot))]
        x0, x1, y0, y1 = grid[i], grid[i + 1], profile[i], profile[i + 1]
        flip = float(x0 - y0 * (x1 - x0) / (y1 - y0))

    call_gex_k = {r["strike"]: r["call_gex"] for r in strike_rows}
    put_gex_k = {r["strike"]: r["put_gex"] for r in strike_rows}
    call_oi_k = {r["strike"]: r["call_oi"] for r in strike_rows}
    put_oi_k = {r["strike"]: r["put_oi"] for r in strike_rows}
    walls = {
        "call_wall": max(call_oi_k, key=lambda k: abs(call_gex_k[k])) if call_oi_k else None,
        "put_wall": max(put_oi_k, key=lambda k: abs(put_gex_k[k])) if put_oi_k else None,
        "max_call_oi": max(call_oi_k, key=call_oi_k.get) if call_oi_k else None,
        "max_put_oi": max(put_oi_k, key=put_oi_k.get) if put_oi_k else None,
    }

    # Per-expiry: OI, notional, put/call, max pain, ATM vol and implied move.
    expiries = []
    for e in sorted(set(exp)):
        m = exp == e
        Ke, ce, oe, ive, Fe, Te = K[m], call[m], oi[m], iv[m], F[m][0], T[m][0]
        cand = np.unique(Ke)
        pain = [(oe * np.where(ce, np.maximum(x - Ke, 0), np.maximum(Ke - x, 0))).sum() for x in cand]
        mp = float(cand[int(np.argmin(pain))])
        atm_iv = float(np.interp(np.log(Fe), np.log(Ke[np.argsort(Ke)]), ive[np.argsort(Ke)]))
        move = Fe * atm_iv * np.sqrt(Te)
        expiries.append({"expiry": e, "days": float(Te * 365), "forward": float(Fe),
                         "call_oi": float(oe[ce].sum()), "put_oi": float(oe[~ce].sum()),
                         "put_call": float(oe[~ce].sum() / max(oe[ce].sum(), 1e-9)),
                         "notional_usd": float(oe.sum() * spot), "max_pain": mp,
                         "max_pain_vs_spot_pct": float((mp / spot - 1) * 100),
                         "atm_iv": atm_iv, "implied_move": float(move), "implied_move_pct": float(move / Fe * 100),
                         "range_lo": float(Fe - move), "range_hi": float(Fe + move),
                         "gex": float(gex[m].sum())})
    total = float(gex.sum())
    regime = ("positive gamma — dealer hedging dampens moves (mean reversion, pinning)" if total > 0 else
              "negative gamma — dealer hedging amplifies moves (trend, vol expansion)")
    if flip is not None:
        regime += f"; spot is {'above' if spot > flip else 'below'} the flip"
    return {
        "spot": float(spot), "convention": convention, "n_options": int(len(rows)), "horizon_days": max_days,
        "totals": {"gex": total, "vex": float(vex.sum()), "cex": float(cex.sum()), "dealer_delta_usd": float(dex.sum()),
                   "call_oi": float(oi[call].sum()), "put_oi": float(oi[~call].sum()),
                   "put_call": float(oi[~call].sum() / max(oi[call].sum(), 1e-9)),
                   "notional_usd": float(oi.sum() * spot)},
        "gamma_flip": flip, "regime": regime, "walls": walls,
        "strikes": strike_rows, "profile": {"spot": grid.tolist(), "gex": profile.tolist()},
        "expiries": expiries,
    }
