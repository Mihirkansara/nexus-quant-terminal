"""Simulators with known volatility dynamics for validating vol_forecast."""
from datetime import date, timedelta
import numpy as np


def ohlc_from_daily_vols(daily_sd, rng, s0=100.0, steps=48):
    """Intraday Brownian paths -> daily O/H/L/C with exact daily variance daily_sd²."""
    n = len(daily_sd)
    o, h, l, c = (np.empty(n + 1) for _ in range(4))
    o[0] = h[0] = l[0] = c[0] = s0
    px = s0
    for t in range(n):
        inc = rng.standard_normal(steps) * daily_sd[t] / np.sqrt(steps)
        path = px * np.exp(np.concatenate([[0.0], np.cumsum(inc)]))
        o[t + 1], h[t + 1], l[t + 1], c[t + 1] = path[0], path.max(), path.min(), path[-1]
        px = path[-1]
    return o, h, l, c


def gjr_garch(n, omega, alpha, gamma, beta, rng):
    """Returns (conditional sd path, returns) of a GJR-GARCH(1,1) with N(0,1) shocks."""
    s2 = omega / (1 - alpha - 0.5 * gamma - beta)
    sds, rets = np.empty(n), np.empty(n)
    for t in range(n):
        sds[t] = np.sqrt(s2)
        rets[t] = sds[t] * rng.standard_normal()
        s2 = omega + (alpha + gamma * (rets[t] < 0)) * rets[t] ** 2 + beta * s2
    return sds, rets


def regime_vols(n, vols, p_stay, rng):
    state, out, states = 0, [], []
    for _ in range(n):
        out.append(vols[state]); states.append(state)
        if rng.random() > p_stay[state]:
            state = 1 - state
    return np.array(out), np.array(states)


def dates(n, start=date(2023, 1, 2)):
    return [start + timedelta(days=i) for i in range(n + 1)]
