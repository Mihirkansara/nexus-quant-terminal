"""
vanna_volga.py — FX volatility smile from ATM / 25Δ risk reversal / 25Δ butterfly
quotes via the Vanna-Volga method.

FX option markets quote each tenor with three liquid instruments:
    ATM   — delta-neutral straddle vol
    RR25  — 25Δ risk reversal  = σ(25Δ call) − σ(25Δ put)
    BF25  — 25Δ butterfly      ≈ (σ(25Δ call) + σ(25Δ put))/2 − σ(ATM)
Pillar vols (smile-strangle approximation, no broker-strangle iteration):
    σ25C = ATM + BF25 + RR25/2      σ25P = ATM + BF25 − RR25/2

Strikes use unadjusted spot delta and the delta-neutral-straddle ATM:
    F     = S·e^((r_d − r_f)·T)
    K_ATM = F·e^(σ²T/2)
    K_Δ   = F·e^(−α·σ·√T + σ²T/2),  α = ±N⁻¹(|Δ|·e^(r_f·T))  (+ call, − put)

The smile between/beyond the pillars uses Castagna & Mercurio's second-order
Vanna-Volga approximation, which reproduces the three pillar vols exactly.

References:
    Castagna, A. & Mercurio, F. (2007). "The vanna-volga method for implied
        volatilities." Risk, January 2007, 106–111.
    Reiswich, D. & Wystup, U. (2010). "A Guide to FX Options Quoting Conventions."
        Journal of Derivatives, 18(2), 58–68.
"""

import numpy as np
from scipy.stats import norm

from .garman_kohlhagen import gk_price


def _forward(S, T, r_d, r_f):
    return S * np.exp((r_d - r_f) * T)


def strike_from_delta(S, T, r_d, r_f, sigma, delta, option_type="call"):
    """Strike for an unadjusted spot delta (|delta| in (0, e^(−r_f·T)))."""
    F = _forward(S, T, r_d, r_f)
    alpha = norm.ppf(abs(delta) * np.exp(r_f * T))
    if option_type == "put":
        alpha = -alpha
    sqrt_T = np.sqrt(T)
    return float(F * np.exp(-alpha * sigma * sqrt_T + 0.5 * sigma ** 2 * T))


def atm_dns_strike(S, T, r_d, r_f, sigma):
    """Delta-neutral straddle ATM strike."""
    return float(_forward(S, T, r_d, r_f) * np.exp(0.5 * sigma ** 2 * T))


def pillars(S, T, r_d, r_f, atm, rr25, bf25):
    """Return the three (strike, vol) pillars: 25Δ put, ATM, 25Δ call."""
    vol_c = atm + bf25 + 0.5 * rr25
    vol_p = atm + bf25 - 0.5 * rr25
    if min(vol_c, vol_p, atm) <= 0:
        raise ValueError("Quotes imply a non-positive pillar volatility.")
    return [
        {"label": "25Δ Put",  "K": strike_from_delta(S, T, r_d, r_f, vol_p, 0.25, "put"),  "vol": vol_p},
        {"label": "ATM DNS",  "K": atm_dns_strike(S, T, r_d, r_f, atm),                  "vol": atm},
        {"label": "25Δ Call", "K": strike_from_delta(S, T, r_d, r_f, vol_c, 0.25, "call"), "vol": vol_c},
    ]


def vv_vol(K, S, T, r_d, r_f, pillar_list):
    """Second-order Vanna-Volga implied vol at strike K (Castagna-Mercurio 2007)."""
    (K1, s1), (K2, s2), (K3, s3) = [(p["K"], p["vol"]) for p in pillar_list]
    K = np.asarray(K, dtype=float)
    F = _forward(S, T, r_d, r_f)
    sqrt_T = np.sqrt(T)

    ln = np.log
    y1 = ln(K2 / K) * ln(K3 / K) / (ln(K2 / K1) * ln(K3 / K1))
    y2 = ln(K / K1) * ln(K3 / K) / (ln(K2 / K1) * ln(K3 / K2))
    y3 = ln(K / K1) * ln(K / K2) / (ln(K3 / K1) * ln(K3 / K2))

    def d1d2(x):
        d1 = (ln(F / x) + 0.5 * s2 ** 2 * T) / (s2 * sqrt_T)
        return d1, d1 - s2 * sqrt_T

    d1K, d2K = d1d2(K)
    d1_1, d2_1 = d1d2(K1)
    d1_3, d2_3 = d1d2(K3)

    first_order = y1 * s1 + y2 * s2 + y3 * s3
    D1 = first_order - s2
    D2 = y1 * d1_1 * d2_1 * (s1 - s2) ** 2 + y3 * d1_3 * d2_3 * (s3 - s2) ** 2
    dd = d1K * d2K
    disc = s2 ** 2 + dd * (2 * s2 * D1 + D2)

    with np.errstate(invalid="ignore", divide="ignore"):
        second = s2 + (-s2 + np.sqrt(disc)) / dd
    # Fall back to first order where the root is undefined or d1·d2 ≈ 0.
    ok = (disc >= 0) & (np.abs(dd) > 1e-10) & np.isfinite(second)
    vol = np.where(ok, second, first_order)
    return np.maximum(vol, 1e-4)


def build_smile(S, T, r_d, r_f, atm, rr25, bf25, options=None, flat_sigma=None, n_points=61):
    """Smile curve, pillar table and (optionally) smile-vs-flat repricing of legs."""
    pl = pillars(S, T, r_d, r_f, atm, rr25, bf25)

    # Curve spans roughly the 5Δ put to 5Δ call strikes.
    K_lo = strike_from_delta(S, T, r_d, r_f, pl[0]["vol"], 0.05, "put")
    K_hi = strike_from_delta(S, T, r_d, r_f, pl[2]["vol"], 0.05, "call")
    strikes = np.exp(np.linspace(np.log(K_lo), np.log(K_hi), n_points))
    vols = vv_vol(strikes, S, T, r_d, r_f, pl)

    flat = atm if flat_sigma is None else flat_sigma
    legs = []
    total_flat = total_smile = 0.0
    for opt in options or []:
        K, qty, otype = float(opt["K"]), float(opt["qty"]), opt["type"]
        leg_T = float(opt.get("T", T))
        # The smile is built for the request tenor T; legs at other tenors reuse it.
        smile_vol = float(vv_vol(K, S, T, r_d, r_f, pl))
        p_flat = gk_price(S, K, leg_T, r_d, r_f, flat, otype) * qty
        p_smile = gk_price(S, K, leg_T, r_d, r_f, smile_vol, otype) * qty
        total_flat += p_flat
        total_smile += p_smile
        legs.append({
            "label": f"{'+' if qty > 0 else ''}{qty:g} {otype.upper()} K={K}",
            "K": K, "flat_vol": round(flat, 5), "smile_vol": round(smile_vol, 5),
            "value_flat": round(p_flat, 6), "value_smile": round(p_smile, 6),
            "smile_adj": round(p_smile - p_flat, 6),
        })

    return {
        "forward": round(float(_forward(S, T, r_d, r_f)), 6),
        "pillars": [{**p, "K": round(p["K"], 6), "vol": round(p["vol"], 5)} for p in pl],
        "strikes": [round(float(k), 6) for k in strikes],
        "vols": [round(float(v), 6) for v in vols],
        "legs": legs,
        "total": {
            "value_flat": round(total_flat, 6),
            "value_smile": round(total_smile, 6),
            "smile_adj": round(total_smile - total_flat, 6),
        },
    }
