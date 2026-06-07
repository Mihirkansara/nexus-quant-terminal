"""
greeks.py — Portfolio-level Greek aggregation.

Wraps the single-option Greeks from black_scholes.py and aggregates them
across a multi-leg portfolio, respecting position quantities (signed).
"""

import numpy as np

from black_scholes import bs_delta, bs_gamma, bs_vega, bs_theta


def portfolio_greeks(
    options: list[dict],
    S: float | np.ndarray,
    sigma: float,
    T: float,
    r: float,
) -> tuple[float, float, float, float]:
    """
    Compute the net Delta, Gamma, Vega, and Theta for a portfolio of options.

    Each option in the portfolio is a dict with keys:
        type (str):  "call" or "put"
        K    (float): strike price
        T    (float): time to expiry in years  [overrides the shared T arg]
        qty  (int):   signed quantity (positive = long, negative = short)

    Args:
        options: List of option leg dicts (see above).
        S:       Current spot price.
        sigma:   Implied volatility (shared across all legs).
        T:       Fallback time to expiry if a leg doesn't define its own.
        r:       Risk-free rate.

    Returns:
        Tuple (total_delta, total_gamma, total_vega, total_theta).
    """
    total_delta = 0.0
    total_gamma = 0.0
    total_vega = 0.0
    total_theta = 0.0

    for opt in options:
        opt_type: str = opt["type"]
        K: float = float(opt["K"])
        qty: float = float(opt["qty"])
        # Allow per-leg expiry; fall back to the shared T
        leg_T: float = float(opt.get("T", T))

        total_delta += float(bs_delta(S, K, leg_T, r, sigma, opt_type)) * qty
        total_gamma += float(bs_gamma(S, K, leg_T, r, sigma)) * qty
        total_vega  += float(bs_vega(S, K, leg_T, r, sigma)) * qty
        total_theta += float(bs_theta(S, K, leg_T, r, sigma, opt_type)) * qty

    return total_delta, total_gamma, total_vega, total_theta
