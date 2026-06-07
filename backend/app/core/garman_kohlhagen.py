"""
garman_kohlhagen.py — Garman-Kohlhagen (1983) model for European forex options.

Extension of Black-Scholes that accounts for BOTH the domestic and foreign
risk-free interest rates — essential for currency options pricing.

Reference: Garman, M.B. & Kohlhagen, S.W. (1983). "Foreign currency option values."
           Journal of International Money and Finance, 2(3), 231–237.

Model:
    d1 = [ln(S/K) + (r_d − r_f + σ²/2)·T] / (σ·√T)
    d2 = d1 − σ·√T
    C  = S·e^(−r_f·T)·N(d1) − K·e^(−r_d·T)·N(d2)
    P  = K·e^(−r_d·T)·N(−d2) − S·e^(−r_f·T)·N(−d1)
"""

import numpy as np
from scipy.stats import norm


def _d1_d2(S: float, K: float, T: float, r_d: float, r_f: float, sigma: float):
    """Compute GK d1 and d2 intermediate values."""
    S = np.asarray(S, dtype=float)
    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r_d - r_f + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T
    return d1, d2


def gk_price(S, K, T, r_d, r_f, sigma, option_type="call"):
    d1, d2 = _d1_d2(S, K, T, r_d, r_f, sigma)
    S = np.asarray(S, dtype=float)
    if option_type == "call":
        return float(S * np.exp(-r_f * T) * norm.cdf(d1) - K * np.exp(-r_d * T) * norm.cdf(d2))
    return float(K * np.exp(-r_d * T) * norm.cdf(-d2) - S * np.exp(-r_f * T) * norm.cdf(-d1))


def gk_delta(S, K, T, r_d, r_f, sigma, option_type="call"):
    """
    Delta — sensitivity of option price to spot rate change.
    Call: e^(−r_f·T)·N(d1)    Put: −e^(−r_f·T)·N(−d1)
    """
    d1, _ = _d1_d2(S, K, T, r_d, r_f, sigma)
    factor = np.exp(-r_f * T)
    if option_type == "call":
        return float(factor * norm.cdf(d1))
    return float(-factor * norm.cdf(-d1))


def gk_gamma(S, K, T, r_d, r_f, sigma):
    """
    Gamma — rate of change of delta.
    Γ = e^(−r_f·T)·N'(d1) / (S·σ·√T)   (same sign for calls and puts)
    """
    d1, _ = _d1_d2(S, K, T, r_d, r_f, sigma)
    return float(np.exp(-r_f * T) * norm.pdf(d1) / (np.asarray(S) * sigma * np.sqrt(T)))


def gk_vega(S, K, T, r_d, r_f, sigma):
    """
    Vega — sensitivity to implied volatility.
    ν = S·e^(−r_f·T)·N'(d1)·√T   (same for calls and puts)
    """
    d1, _ = _d1_d2(S, K, T, r_d, r_f, sigma)
    return float(np.asarray(S) * np.exp(-r_f * T) * norm.pdf(d1) * np.sqrt(T))


def gk_theta(S, K, T, r_d, r_f, sigma, option_type="call"):
    """
    Theta — time decay (per year).
    Call: −S·σ·e^(−r_f·T)·N'(d1)/(2√T) − r_d·K·e^(−r_d·T)·N(d2) + r_f·S·e^(−r_f·T)·N(d1)
    Put:  −S·σ·e^(−r_f·T)·N'(d1)/(2√T) + r_d·K·e^(−r_d·T)·N(−d2) − r_f·S·e^(−r_f·T)·N(−d1)
    """
    d1, d2 = _d1_d2(S, K, T, r_d, r_f, sigma)
    S = np.asarray(S, dtype=float)
    decay = -(S * sigma * np.exp(-r_f * T) * norm.pdf(d1)) / (2 * np.sqrt(T))
    if option_type == "call":
        return float(decay - r_d * K * np.exp(-r_d * T) * norm.cdf(d2)
                     + r_f * S * np.exp(-r_f * T) * norm.cdf(d1))
    return float(decay + r_d * K * np.exp(-r_d * T) * norm.cdf(-d2)
                 - r_f * S * np.exp(-r_f * T) * norm.cdf(-d1))


def gk_rho_d(S, K, T, r_d, r_f, sigma, option_type="call"):
    """
    Rho_d — sensitivity to DOMESTIC interest rate.
    Call: K·T·e^(−r_d·T)·N(d2)    Put: −K·T·e^(−r_d·T)·N(−d2)
    """
    _, d2 = _d1_d2(S, K, T, r_d, r_f, sigma)
    factor = K * T * np.exp(-r_d * T)
    if option_type == "call":
        return float(factor * norm.cdf(d2))
    return float(-factor * norm.cdf(-d2))


def gk_phi(S, K, T, r_d, r_f, sigma, option_type="call"):
    """
    Phi (ρ_f) — sensitivity to FOREIGN interest rate.
    Call: −S·T·e^(−r_f·T)·N(d1)    Put: S·T·e^(−r_f·T)·N(−d1)
    """
    d1, _ = _d1_d2(S, K, T, r_d, r_f, sigma)
    factor = np.asarray(S) * T * np.exp(-r_f * T)
    if option_type == "call":
        return float(-factor * norm.cdf(d1))
    return float(factor * norm.cdf(-d1))
