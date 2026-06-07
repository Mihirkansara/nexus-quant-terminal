import numpy as np
from scipy.stats import norm


def _d1_d2(S, K, T, r, sigma):
    S = np.asarray(S, dtype=float)
    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T
    return d1, d2


def bs_price(S, K, T, r, sigma, option_type="call"):
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    if option_type == "call":
        return float(np.asarray(S) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2))
    return float(K * np.exp(-r * T) * norm.cdf(-d2) - np.asarray(S) * norm.cdf(-d1))


def bs_delta(S, K, T, r, sigma, option_type="call"):
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return float(norm.cdf(d1) if option_type == "call" else norm.cdf(d1) - 1.0)


def bs_gamma(S, K, T, r, sigma):
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return float(norm.pdf(d1) / (np.asarray(S) * sigma * np.sqrt(T)))


def bs_vega(S, K, T, r, sigma):
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return float(np.asarray(S) * norm.pdf(d1) * np.sqrt(T))


def bs_theta(S, K, T, r, sigma, option_type="call"):
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    S = np.asarray(S)
    decay = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
    if option_type == "call":
        return float(decay - r * K * np.exp(-r * T) * norm.cdf(d2))
    return float(decay + r * K * np.exp(-r * T) * norm.cdf(-d2))


def bs_rho(S, K, T, r, sigma, option_type="call"):
    """Rho — sensitivity to interest rate changes."""
    _, d2 = _d1_d2(S, K, T, r, sigma)
    if option_type == "call":
        return float(K * T * np.exp(-r * T) * norm.cdf(d2))
    return float(-K * T * np.exp(-r * T) * norm.cdf(-d2))
