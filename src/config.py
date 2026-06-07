"""
config.py — Central configuration and default parameters.

Change values here instead of hunting through the codebase.
"""

# ---------------------------------------------------------------------------
# Default market parameters
# ---------------------------------------------------------------------------
DEFAULT_SPOT: float = 100.0       # Starting underlying price (S₀)
DEFAULT_VOLATILITY: float = 0.20  # Implied volatility (σ), 20 %
DEFAULT_RISK_FREE_RATE: float = 0.01  # Annualised risk-free rate (r), 1 %
DEFAULT_TIME_TO_EXPIRY: float = 0.5   # Time to expiry in years (T)

# ---------------------------------------------------------------------------
# Surface scan ranges
# ---------------------------------------------------------------------------
SPOT_LOW: float = 80.0
SPOT_HIGH: float = 120.0
SPOT_STEPS: int = 50

VOL_LOW: float = 0.10
VOL_HIGH: float = 0.40
VOL_STEPS: int = 50

# ---------------------------------------------------------------------------
# Plot settings
# ---------------------------------------------------------------------------
FIGURE_SIZE: tuple = (8, 7)
SAVE_PLOTS: bool = True          # Set False to skip saving PNG files
PLOT_OUTPUT_DIR: str = "plots"   # Relative to the directory main.py is run from

# ---------------------------------------------------------------------------
# Example portfolio (list of option legs)
# Each leg: type ('call'|'put'), K (strike), T (expiry in years), qty (signed)
# ---------------------------------------------------------------------------
EXAMPLE_PORTFOLIO: list = [
    {"type": "call", "K": 100.0, "T": 0.5, "qty": 2},   # Long 2 ATM calls
    {"type": "put",  "K": 95.0,  "T": 0.5, "qty": -1},  # Short 1 OTM put
    {"type": "call", "K": 110.0, "T": 0.5, "qty": -1},  # Short 1 OTM call (spread)
]
