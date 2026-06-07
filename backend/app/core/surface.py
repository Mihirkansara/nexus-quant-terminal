"""surface.py — 2-D risk surface computation over spot × vol grid."""

import numpy as np
from .greeks import portfolio_greeks
from .garman_kohlhagen import gk_price


def compute_surfaces(options, S_range, sigma_range, T, r_d, r_f):
    """Compute Delta, Gamma, Vega, Theta, and P&L surfaces."""
    n_s, n_v = len(S_range), len(sigma_range)
    D = np.zeros((n_s, n_v)); G = np.zeros((n_s, n_v))
    V = np.zeros((n_s, n_v)); Th = np.zeros((n_s, n_v))

    for i, S in enumerate(S_range):
        for j, sigma in enumerate(sigma_range):
            g = portfolio_greeks(options, S, sigma, T, r_d, r_f)["total"]
            D[i,j]=g["delta"]; G[i,j]=g["gamma"]
            V[i,j]=g["vega"];  Th[i,j]=g["theta"]

    # P&L via Delta-Gamma approx around grid midpoint
    S0    = S_range[len(S_range)//2]
    sig0  = sigma_range[len(sigma_range)//2]
    base  = portfolio_greeks(options, S0, sig0, T, r_d, r_f)["total"]
    PnL   = np.zeros((n_s, n_v))
    for i, S in enumerate(S_range):
        dS = S - S0
        PnL[i,:] = base["delta"]*dS + 0.5*base["gamma"]*dS**2

    return {
        "S_range": S_range.tolist(), "sigma_range": sigma_range.tolist(),
        "delta": D.tolist(), "gamma": G.tolist(),
        "vega": V.tolist(),  "theta": Th.tolist(), "pnl": PnL.tolist(),
    }
