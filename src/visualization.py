"""
visualization.py — 3-D surface plots for all five risk surfaces.

Each plot uses a dark background and a distinct colormap so the surfaces
are visually distinguishable at a glance.  Optionally saves PNG files
with ISO-8601 timestamps so successive runs never overwrite each other.
"""

import os
from datetime import datetime

import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401 — registers 3-D projection


# Colormap and label config for each surface type
_SURFACE_CONFIG: dict[str, dict] = {
    "Delta":  {"cmap": "plasma",  "zlabel": "Delta",       "title": "Delta Surface"},
    "Gamma":  {"cmap": "cividis", "zlabel": "Gamma",       "title": "Gamma Surface"},
    "Vega":   {"cmap": "viridis", "zlabel": "Vega",        "title": "Vega Surface"},
    "Theta":  {"cmap": "inferno", "zlabel": "Theta / yr",  "title": "Theta Surface"},
    "PnL":    {"cmap": "magma",   "zlabel": "P&L ($)",     "title": "Risk (P&L) Surface"},
}


def _plot_single_surface(
    X: np.ndarray,
    Y: np.ndarray,
    Z: np.ndarray,
    name: str,
    fig_size: tuple[int, int] = (8, 7),
    save_dir: str | None = None,
) -> None:
    """
    Render one 3-D surface plot and optionally save it as a PNG.

    Args:
        X:        Meshgrid of spot prices (shape: n×m).
        Y:        Meshgrid of implied volatilities (shape: n×m).
        Z:        Surface values (shape: n×m).
        name:     Key into _SURFACE_CONFIG (e.g. "Delta").
        fig_size: Figure size in inches.
        save_dir: If provided, save the PNG to this directory.
    """
    cfg = _SURFACE_CONFIG[name]

    fig = plt.figure(figsize=fig_size)
    ax = fig.add_subplot(111, projection="3d")

    surf = ax.plot_surface(X, Y, Z, cmap=cfg["cmap"], edgecolor="none", alpha=0.95)
    # Floor contour projection for depth perception
    ax.contourf(X, Y, Z, zdir="z", offset=float(Z.min()), cmap=cfg["cmap"], alpha=0.45)

    ax.set_xlabel("Underlying Price ($)", fontsize=11)
    ax.set_ylabel("Implied Volatility", fontsize=11)
    ax.set_zlabel(cfg["zlabel"], fontsize=11)
    ax.set_title(cfg["title"], fontsize=13, pad=12)
    fig.colorbar(surf, ax=ax, shrink=0.6, aspect=10)
    fig.tight_layout()

    if save_dir is not None:
        os.makedirs(save_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(save_dir, f"{name}_{timestamp}.png")
        fig.savefig(filename, dpi=150, bbox_inches="tight")
        print(f"  [saved] {filename}")


def plot_all_surfaces(
    X: np.ndarray,
    Y: np.ndarray,
    Delta: np.ndarray,
    Gamma: np.ndarray,
    Vega: np.ndarray,
    Theta: np.ndarray,
    PnL: np.ndarray,
    fig_size: tuple[int, int] = (8, 7),
    save_dir: str | None = None,
) -> None:
    """
    Plot all five risk surfaces: Delta, Gamma, Vega, Theta, and P&L.

    Args:
        X:        Meshgrid of spot prices.
        Y:        Meshgrid of implied volatilities.
        Delta:    Delta surface array.
        Gamma:    Gamma surface array.
        Vega:     Vega surface array.
        Theta:    Theta surface array.
        PnL:      P&L surface array.
        fig_size: (width, height) in inches for each figure.
        save_dir: Directory to save PNGs; None = display only.
    """
    plt.style.use("dark_background")

    surfaces = {
        "Delta": Delta,
        "Gamma": Gamma,
        "Vega":  Vega,
        "Theta": Theta,
        "PnL":   PnL,
    }

    for name, Z in surfaces.items():
        _plot_single_surface(X, Y, Z, name, fig_size=fig_size, save_dir=save_dir)

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        plt.show()
