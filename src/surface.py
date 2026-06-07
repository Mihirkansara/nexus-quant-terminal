"""
surface.py — Build 2-D risk surfaces across spot-price × volatility space.

Each surface is a 2-D numpy array indexed by [spot_index, vol_index].
The caller creates the meshgrid axes (S_range, sigma_range) and passes them in.
"""

import numpy as np

from black_scholes import black_scholes_price
from greeks import portfolio_greeks


def risk_surface(
    options: list[dict],
    S_range: np.ndarray,
    sigma_range: np.ndarray,
    T: float,
    r: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute Delta, Gamma, Vega, and Theta surfaces over a grid of S and σ.

    Args:
        options:     Portfolio legs (see greeks.portfolio_greeks for schema).
        S_range:     1-D array of spot prices to scan.
        sigma_range: 1-D array of implied volatilities to scan.
        T:           Shared time to expiry in years.
        r:           Risk-free rate.

    Returns:
        Four 2-D arrays (Delta, Gamma, Vega, Theta), each shaped
        (len(S_range), len(sigma_range)).
    """
    n_s = len(S_range)
    n_v = len(sigma_range)

    Delta_surface = np.zeros((n_s, n_v))
    Gamma_surface = np.zeros((n_s, n_v))
    Vega_surface  = np.zeros((n_s, n_v))
    Theta_surface = np.zeros((n_s, n_v))

    for i, S in enumerate(S_range):
        for j, sigma in enumerate(sigma_range):
            d, g, v, th = portfolio_greeks(options, S, sigma, T, r)
            Delta_surface[i, j] = d
            Gamma_surface[i, j] = g
            Vega_surface[i, j]  = v
            Theta_surface[i, j] = th

    return Delta_surface, Gamma_surface, Vega_surface, Theta_surface


def pnl_surface(
    options: list[dict],
    S_range: np.ndarray,
    sigma_range: np.ndarray,
    T: float,
    r: float,
    S0: float,
    sigma0: float,
) -> np.ndarray:
    """
    Approximate P&L surface using a second-order Taylor expansion.

    P&L ≈ Δ·ΔS + 0.5·Γ·(ΔS)²

    where Δ and Γ are evaluated at the base point (S0, sigma0).
    This is the standard "Delta-Gamma" approximation used in risk management.

    Args:
        options:     Portfolio legs.
        S_range:     1-D array of spot prices to scan.
        sigma_range: 1-D array of implied volatilities to scan.
        T:           Time to expiry in years.
        r:           Risk-free rate.
        S0:          Current / reference spot price.
        sigma0:      Current / reference volatility.

    Returns:
        2-D P&L array shaped (len(S_range), len(sigma_range)).
    """
    base_delta, base_gamma, _, _ = portfolio_greeks(options, S0, sigma0, T, r)

    PnL = np.zeros((len(S_range), len(sigma_range)))
    for i, S in enumerate(S_range):
        dS = S - S0
        # Taylor: P&L ≈ Δ·dS + 0.5·Γ·dS²
        PnL[i, :] = base_delta * dS + 0.5 * base_gamma * dS ** 2

    return PnL
