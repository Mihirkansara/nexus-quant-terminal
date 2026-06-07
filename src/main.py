"""
main.py — Entry point for the Delta-Gamma Risk Surface Bot.

Usage (from the repo root):
    cd src
    python main.py

What it does:
  1. Defines an example multi-leg option portfolio.
  2. Computes a summary table of Greeks at the current spot price.
  3. Scans across a spot-price × volatility grid and builds five 3-D surfaces:
     Delta, Gamma, Vega, Theta, and P&L.
  4. Displays all surfaces interactively and saves them as timestamped PNGs.
"""

import sys
import os

import numpy as np

# Make sure sibling modules are importable when run from inside src/
sys.path.insert(0, os.path.dirname(__file__))

from config import (
    DEFAULT_SPOT,
    DEFAULT_VOLATILITY,
    DEFAULT_RISK_FREE_RATE,
    DEFAULT_TIME_TO_EXPIRY,
    SPOT_LOW, SPOT_HIGH, SPOT_STEPS,
    VOL_LOW, VOL_HIGH, VOL_STEPS,
    FIGURE_SIZE,
    SAVE_PLOTS,
    PLOT_OUTPUT_DIR,
    EXAMPLE_PORTFOLIO,
)
from greeks import portfolio_greeks
from surface import risk_surface, pnl_surface
from visualization import plot_all_surfaces


def print_summary_table(
    options: list[dict],
    S0: float,
    sigma0: float,
    T: float,
    r: float,
) -> None:
    """
    Print a formatted table of portfolio Greeks at the current spot price.

    Args:
        options: List of option legs.
        S0:      Current spot price.
        sigma0:  Current implied volatility.
        T:       Time to expiry in years.
        r:       Risk-free rate.
    """
    delta, gamma, vega, theta = portfolio_greeks(options, S0, sigma0, T, r)

    print("\n" + "=" * 52)
    print("  PORTFOLIO GREEK SUMMARY  (at current spot)")
    print("=" * 52)
    print(f"  Spot price      : ${S0:.2f}")
    print(f"  Implied vol     : {sigma0 * 100:.1f}%")
    print(f"  Time to expiry  : {T:.2f} years")
    print(f"  Risk-free rate  : {r * 100:.1f}%")
    print("-" * 52)
    print(f"  Delta           : {delta:+.4f}")
    print(f"  Gamma           : {gamma:+.6f}")
    print(f"  Vega            : {vega:+.4f}  (per unit vol)")
    print(f"  Theta           : {theta:+.4f}  (per year)")
    print(f"  Theta (daily)   : {theta / 365:+.4f}  (per calendar day)")
    print("=" * 52 + "\n")


def main() -> None:
    """
    Orchestrate the full analysis pipeline.
    """
    portfolio = EXAMPLE_PORTFOLIO
    S0 = DEFAULT_SPOT
    sigma0 = DEFAULT_VOLATILITY
    T = DEFAULT_TIME_TO_EXPIRY
    r = DEFAULT_RISK_FREE_RATE

    # --- Step 1: Console summary at current market params -----------------------
    print_summary_table(portfolio, S0, sigma0, T, r)

    # --- Step 2: Build scan grids -----------------------------------------------
    S_range = np.linspace(SPOT_LOW, SPOT_HIGH, SPOT_STEPS)
    sigma_range = np.linspace(VOL_LOW, VOL_HIGH, VOL_STEPS)

    # Meshgrid for plotting (X = spot, Y = vol)
    X, Y = np.meshgrid(S_range, sigma_range, indexing="ij")

    # --- Step 3: Compute surfaces -----------------------------------------------
    print("Computing risk surfaces ... ", end="", flush=True)
    Delta, Gamma, Vega, Theta = risk_surface(portfolio, S_range, sigma_range, T, r)
    PnL = pnl_surface(portfolio, S_range, sigma_range, T, r, S0, sigma0)
    print("done.")

    # --- Step 4: Plot -----------------------------------------------------------
    save_dir = PLOT_OUTPUT_DIR if SAVE_PLOTS else None
    if save_dir:
        print(f"Saving plots to: {os.path.abspath(save_dir)}/")

    plot_all_surfaces(
        X, Y, Delta, Gamma, Vega, Theta, PnL,
        fig_size=FIGURE_SIZE,
        save_dir=save_dir,
    )


if __name__ == "__main__":
    main()
