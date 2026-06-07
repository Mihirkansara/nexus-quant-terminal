"""montecarlo.py — GBM Monte Carlo for forex options (uses GK cost basis)."""

import numpy as np
from .garman_kohlhagen import gk_price


def run_montecarlo(options, S0, sigma, r_d, r_f, T, n_paths=1000, n_steps=100):
    """Simulate GBM price paths and compute P&L distribution at expiry."""
    dt = T / n_steps
    Z  = np.random.standard_normal((n_paths, n_steps))
    paths = np.zeros((n_paths, n_steps + 1)); paths[:,0] = S0

    # GBM: dS = (r_d - r_f)·S·dt + σ·S·dW  (Garman-Kohlhagen drift)
    for t in range(1, n_steps + 1):
        paths[:,t] = paths[:,t-1] * np.exp(
            (r_d - r_f - 0.5*sigma**2)*dt + sigma*np.sqrt(dt)*Z[:,t-1]
        )

    terminal = paths[:,-1]
    pnl = np.zeros(n_paths)
    for opt in options:
        K, qty = float(opt["K"]), float(opt["qty"])
        payoff = (np.maximum(terminal - K, 0) if opt["type"]=="call"
                  else np.maximum(K - terminal, 0))
        pnl += payoff * qty

    # Subtract initial GK cost
    cost = sum(
        gk_price(S0, float(o["K"]), float(o.get("T",T)), r_d, r_f, sigma, o["type"])
        * float(o["qty"]) for o in options
    )
    pnl -= cost

    idx = np.random.choice(n_paths, size=min(60, n_paths), replace=False)
    return {
        "time_axis": [round(i*dt, 4) for i in range(n_steps+1)],
        "sample_paths": paths[idx].tolist(),
        "pnl": pnl.tolist(),
        "pnl_mean":     round(float(pnl.mean()), 5),
        "pnl_std":      round(float(pnl.std()), 5),
        "pnl_5pct":     round(float(np.percentile(pnl, 5)), 5),
        "pnl_95pct":    round(float(np.percentile(pnl, 95)), 5),
        "prob_profit":  round(float((pnl > 0).mean()), 4),
    }
