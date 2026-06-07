"""
black_scholes.py — Core Black-Scholes pricing and Greek calculations.

The Black-Scholes model prices European options under the assumptions of:
  - Constant volatility and risk-free rate
  - Log-normally distributed asset prices
  - No dividends, no transaction costs

References: Black & Scholes (1973), Merton (1973)
"""

import numpy as np
from scipy.stats import norm


def _d1_d2(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute the d1 and d2 intermediate terms used throughout Black-Scholes.

    d1 = [ln(S/K) + (r + σ²/2)·T] / (σ·√T)
    d2 = d1 − σ·√T

    Args:
        S:     Spot price of the underlying asset.
        K:     Strike price of the option.
        T:     Time to expiry in years (must be > 0).
        r:     Annualised risk-free interest rate (decimal, e.g. 0.05 = 5 %).
        sigma: Implied volatility (decimal, e.g. 0.20 = 20 %).

    Returns:
        Tuple (d1, d2) as numpy arrays.

    Raises:
        ValueError: If T <= 0 or sigma <= 0.
    """
    S = np.asarray(S, dtype=float)
    if np.any(T <= 0):
        raise ValueError(f"Time to expiry T must be positive, got {T}.")
    if np.any(sigma <= 0):
        raise ValueError(f"Volatility sigma must be positive, got {sigma}.")
    if np.any(S <= 0):
        raise ValueError(f"Spot price S must be positive, got {S}.")

    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T
    return d1, d2


def black_scholes_price(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str = "call",
) -> np.ndarray:
    """
    Calculate the theoretical price of a European option via Black-Scholes.

    Args:
        S:           Spot price of the underlying asset.
        K:           Strike price.
        T:           Time to expiry in years.
        r:           Risk-free rate (annualised, decimal).
        sigma:       Implied volatility (annualised, decimal).
        option_type: "call" or "put".

    Returns:
        Option price as a numpy scalar or array matching the shape of S.

    Raises:
        ValueError: If option_type is not "call" or "put".
    """
    option_type = option_type.lower()
    if option_type not in ("call", "put"):
        raise ValueError(f"option_type must be 'call' or 'put', got '{option_type}'.")

    d1, d2 = _d1_d2(S, K, T, r, sigma)

    if option_type == "call":
        # C = S·N(d1) − K·e^(−rT)·N(d2)
        return np.asarray(S) * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    else:
        # P = K·e^(−rT)·N(−d2) − S·N(−d1)
        return K * np.exp(-r * T) * norm.cdf(-d2) - np.asarray(S) * norm.cdf(-d1)


def bs_delta(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str = "call",
) -> np.ndarray:
    """
    Delta — rate of change of option price with respect to the spot price.

    Intuition: a delta of 0.6 means the option gains ~$0.60 for every $1 rise
    in the underlying.

    Call delta: N(d1)         Range: [0, 1]
    Put  delta: N(d1) − 1    Range: [−1, 0]
    """
    d1, _ = _d1_d2(S, K, T, r, sigma)
    if option_type.lower() == "call":
        return norm.cdf(d1)
    return norm.cdf(d1) - 1.0


def bs_gamma(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
) -> np.ndarray:
    """
    Gamma — rate of change of delta with respect to the spot price.

    Same for calls and puts (by put-call parity).

    Γ = N'(d1) / (S·σ·√T)

    Intuition: high gamma means delta is unstable — the option is most sensitive
    near the strike as expiry approaches.
    """
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return norm.pdf(d1) / (np.asarray(S) * sigma * np.sqrt(T))


def bs_vega(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
) -> np.ndarray:
    """
    Vega — sensitivity of option price to a change in implied volatility.

    ν = S·N'(d1)·√T

    Result is in price-per-unit-vol; divide by 100 for price-per-1%-vol-move.

    Intuition: a vega of 0.25 means the option gains $0.25 for every 1-point
    rise in implied volatility.  Same for calls and puts.
    """
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return np.asarray(S) * norm.pdf(d1) * np.sqrt(T)


def bs_theta(
    S: float | np.ndarray,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str = "call",
) -> np.ndarray:
    """
    Theta — rate of change of option price with respect to time (time decay).

    Returned as price change per year; divide by 365 for per-day decay.

    Call Θ = −[S·N'(d1)·σ / (2√T)] − r·K·e^(−rT)·N(d2)
    Put  Θ = −[S·N'(d1)·σ / (2√T)] + r·K·e^(−rT)·N(−d2)

    Intuition: theta is almost always negative — options lose value as time
    passes, all else equal.
    """
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    S = np.asarray(S)
    decay = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))

    if option_type.lower() == "call":
        return decay - r * K * np.exp(-r * T) * norm.cdf(d2)
    return decay + r * K * np.exp(-r * T) * norm.cdf(-d2)
