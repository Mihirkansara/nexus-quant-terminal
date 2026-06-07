"""greeks.py — Portfolio-level Greek aggregation using Garman-Kohlhagen model."""

from .garman_kohlhagen import (
    gk_delta, gk_gamma, gk_vega, gk_theta, gk_rho_d, gk_phi
)


def portfolio_greeks(
    options: list[dict], S: float, sigma: float,
    T: float, r_d: float, r_f: float
) -> dict:
    """Aggregate GK Greeks across all legs of a forex options portfolio."""
    total = {"delta": 0.0, "gamma": 0.0, "vega": 0.0,
             "theta": 0.0, "rho_d": 0.0, "phi": 0.0}
    legs = []

    for opt in options:
        otype = opt["type"]
        K, qty = float(opt["K"]), float(opt["qty"])
        leg_T = float(opt.get("T", T))

        d   = gk_delta(S, K, leg_T, r_d, r_f, sigma, otype) * qty
        g   = gk_gamma(S, K, leg_T, r_d, r_f, sigma) * qty
        v   = gk_vega(S, K, leg_T, r_d, r_f, sigma) * qty
        th  = gk_theta(S, K, leg_T, r_d, r_f, sigma, otype) * qty
        rho = gk_rho_d(S, K, leg_T, r_d, r_f, sigma, otype) * qty
        phi = gk_phi(S, K, leg_T, r_d, r_f, sigma, otype) * qty

        total["delta"] += d; total["gamma"] += g; total["vega"]  += v
        total["theta"] += th; total["rho_d"] += rho; total["phi"] += phi

        legs.append({
            "label": f"{'+'if qty>0 else ''}{int(qty)} {otype.upper()} K={K}",
            "delta": round(d, 5), "gamma": round(g, 7),
            "vega": round(v, 4),  "theta": round(th, 4),
        })

    return {
        "total": {k: round(v, 6) for k, v in total.items()},
        "legs": legs,
    }
