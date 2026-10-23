"""
margin.py — Exchange margin for an option book and the risk of a margin call.

1. CME SPAN-style scan risk (CME "SPAN methodology"; NSE Clearing SPAN notes):
   16 scenarios — price moves of 0, ±1/3, ±2/3, ±3/3 of the price scan range (PSR), each with
   implied vol up / down by the volatility scan range (VSR) — plus two extreme moves of ±3×PSR
   (vol unchanged) of which only 33 % of the loss is counted. Scan risk = the largest loss; the
   requirement is max(scan risk, short-option minimum). Since 13 Jan 2026 CME sets COMEX
   precious-metal margins as a % of contract value (gold 5 %, silver 9–10 % after the May 2026
   cut), which is used here as the default PSR.
2. Deribit-style portfolio margin (Deribit PM / Segregated PM guide): a risk matrix of price moves
   up to ±16 % (9 buckets) × vol shocks, an extended table of −66 %, −33 %, +50 % … +500 % with
   vol up only and a dampener on its loss, plus a delta contingency (0.6 % of |net delta|·S in the
   2022 model). Initial margin = worst loss + contingency; maintenance = 0.8 × initial. Vol-shock
   sizes and the dampener are not fully published and are exposed as parameters.
3. Margin-call risk: Monte-Carlo spot / vol paths (GBM or Merton jumps, vol co-moving with spot via
   a spot-vol beta), daily revaluation of equity against the maintenance requirement (pre-computed
   on a spot × vol grid), giving P(margin call), P(liquidation), days-to-call distribution and the
   liquidation price ladder. A margin-hike shock scales the scan ranges (the Jan-2026 COMEX hikes
   took silver from 11 % to 15 % to 18 % within weeks).
"""

import numpy as np

from .exotics import gk_vanilla

SPAN_PRICE = [0, 0, 1 / 3, 1 / 3, -1 / 3, -1 / 3, 2 / 3, 2 / 3, -2 / 3, -2 / 3, 1, 1, -1, -1]
SPAN_VOL = [1, -1] * 7


def book_value(legs, S, sigma, r_d, r_f, hedge_units=0.0, dt=0.0):
    """Option legs + a linear hedge (spot / perp units). S, sigma may be arrays (same shape)."""
    S = np.asarray(S, float)
    sigma = np.maximum(np.asarray(sigma, float), 0.01)
    v = hedge_units * S
    for leg in legs:
        T = leg["T"] - dt
        call = leg["type"] == "call"
        if T <= 1e-6:
            v = v + leg["qty"] * (np.maximum(S - leg["K"], 0) if call else np.maximum(leg["K"] - S, 0))
        else:
            v = v + leg["qty"] * gk_vanilla(S, leg["K"], T, r_d, r_f, sigma, call)
    return v


def span_margin(legs, S, sigma, r_d, r_f, psr_pct, vsr_pts, hedge_units=0.0, extreme_mult=3.0,
                extreme_cover=0.33, som_pct=None):
    """16-scenario SPAN-style scan risk; PSR in % of spot, VSR in vol points."""
    psr = S * psr_pct / 100
    vsr = vsr_pts / 100
    v0 = float(book_value(legs, S, sigma, r_d, r_f, hedge_units))
    rows = []
    for i, (pf, vf) in enumerate(zip(SPAN_PRICE, SPAN_VOL)):
        pnl = float(book_value(legs, max(S + pf * psr, 0.01 * S), sigma + vf * vsr, r_d, r_f, hedge_units)) - v0
        rows.append({"scenario": i + 1, "price_move": pf * psr, "price_pct": pf * psr_pct, "vol_move_pts": vf * vsr_pts,
                     "pnl": pnl, "loss_counted": max(-pnl, 0.0), "cover": 1.0})
    for j, sgn in enumerate((1, -1)):
        # Extreme moves can exceed 100 % for wide scan ranges (crypto after a hike): floor spot at 1 %.
        pnl = float(book_value(legs, max(S + sgn * extreme_mult * psr, 0.01 * S), sigma, r_d, r_f, hedge_units)) - v0
        rows.append({"scenario": 15 + j, "price_move": sgn * extreme_mult * psr, "price_pct": sgn * extreme_mult * psr_pct,
                     "vol_move_pts": 0.0, "pnl": pnl, "loss_counted": max(-pnl, 0.0) * extreme_cover, "cover": extreme_cover})
    scan = max(r["loss_counted"] for r in rows)
    worst = max(rows, key=lambda r: r["loss_counted"])
    n_short = sum(abs(l["qty"]) for l in legs if l["qty"] < 0)
    som_rate = som_pct if som_pct is not None else 0.1 * psr_pct       # default: 10 % of the scan range
    som = n_short * S * som_rate / 100
    return {"method": "SPAN", "scan_risk": scan, "short_option_minimum": som, "requirement": max(scan, som),
            "binding": "scan risk" if scan >= som else "short option minimum",
            "worst_scenario": worst["scenario"], "psr": psr, "psr_pct": psr_pct, "vsr_pts": vsr_pts,
            "scenarios": rows, "book_value": v0}


def pm_margin(legs, S, sigma, r_d, r_f, hedge_units=0.0, max_move_pct=16.0, vol_up_pct=45.0, vol_down_pct=30.0,
              extended=(-66, -33, 50, 100, 200, 300, 400, 500), dampener=0.03, delta_contingency=0.006, mm_factor=0.8):
    """Deribit-style portfolio margin. Vol shocks are relative (% of current vol), scaled by (30/DTE)^0.3."""
    moves = np.linspace(-max_move_pct, max_move_pct, 9)
    dte = max(min(l["T"] for l in legs) * 365, 1.0) if legs else 30.0
    scale = (30 / dte) ** 0.3
    vu, vd = sigma * (1 + vol_up_pct / 100 * scale), sigma * max(1 - vol_down_pct / 100 * scale, 0.05)
    v0 = float(book_value(legs, S, sigma, r_d, r_f, hedge_units))
    matrix = []
    for vol_label, vv in (("vol down", vd), ("vol flat", sigma), ("vol up", vu)):
        row = [float(book_value(legs, S * (1 + m / 100), vv, r_d, r_f, hedge_units)) - v0 for m in moves]
        matrix.append({"vol": vol_label, "vol_level": float(vv), "pnl": row})
    ext = [{"move_pct": m, "pnl": float(book_value(legs, S * (1 + m / 100), vu, r_d, r_f, hedge_units)) - v0} for m in extended]
    for e in ext:
        e["loss_counted"] = max(-e["pnl"], 0.0) * dampener
    worst_main = max(max(-p for p in r["pnl"]) for r in matrix)
    worst_ext = max(e["loss_counted"] for e in ext) if ext else 0.0
    h = S * 1e-4
    delta = float((book_value(legs, S + h, sigma, r_d, r_f, hedge_units) - book_value(legs, S - h, sigma, r_d, r_f, hedge_units)) / (2 * h))
    contingency = delta_contingency * abs(delta) * S
    im = max(worst_main, worst_ext, 0.0) + contingency
    return {"method": "PM", "initial": im, "maintenance": mm_factor * im, "worst_matrix": worst_main, "worst_extended": worst_ext,
            "delta_contingency": contingency, "net_delta": delta, "moves_pct": moves.tolist(), "matrix": matrix, "extended": ext,
            "vol_shock_scale": scale, "book_value": v0}


def requirement(method, legs, S, sigma, r_d, r_f, hedge_units, params):
    if method == "span":
        return span_margin(legs, S, sigma, r_d, r_f, params["psr_pct"], params["vsr_pts"], hedge_units)["requirement"]
    return pm_margin(legs, S, sigma, r_d, r_f, hedge_units, max_move_pct=params.get("max_move_pct", 16.0))["maintenance"]


def margin_call_sim(legs, S, sigma, r_d, r_f, equity, method, params, hedge_units=0.0, days=10, n_paths=4000,
                    spot_vol_beta=-0.5, jump=None, ppy=365, seed=11, liq_fraction=0.5):
    """
    Daily equity vs maintenance requirement. Requirement is pre-computed on a (spot, vol) grid.
    Liquidation when equity < liq_fraction × requirement (or ≤ 0).
    """
    rng = np.random.default_rng(seed)
    dt = 1 / ppy
    v0 = float(book_value(legs, S, sigma, r_d, r_f, hedge_units))
    s_grid = S * np.exp(np.linspace(-4, 4, 33) * sigma * np.sqrt(days / ppy) + 0.0)
    vol_grid = sigma * np.array([0.6, 0.8, 1.0, 1.25, 1.6, 2.0])
    req = np.array([[requirement(method, legs, s, v, r_d, r_f, hedge_units, params) for s in s_grid] for v in vol_grid])

    def req_at(s, v):
        # Bilinear interpolation in (log spot, vol).
        ls, lg = np.log(s), np.log(s_grid)
        i = np.clip(np.searchsorted(lg, ls) - 1, 0, len(lg) - 2)
        wi = np.clip((ls - lg[i]) / (lg[i + 1] - lg[i]), 0, 1)
        j = np.clip(np.searchsorted(vol_grid, v) - 1, 0, len(vol_grid) - 2)
        wj = np.clip((v - vol_grid[j]) / (vol_grid[j + 1] - vol_grid[j]), 0, 1)
        r00, r01 = req[j, i], req[j, i + 1]
        r10, r11 = req[j + 1, i], req[j + 1, i + 1]
        return (1 - wj) * ((1 - wi) * r00 + wi * r01) + wj * ((1 - wi) * r10 + wi * r11)

    s = np.full(n_paths, float(S))
    vol = np.full(n_paths, float(sigma))
    called = np.full(n_paths, -1)
    liquidated = np.full(n_paths, -1)
    eq_path = []
    lam = jump["lambda"] if jump else 0.0
    for d in range(1, days + 1):
        z = rng.standard_normal(n_paths)
        jmp = 0.0
        if lam > 0:
            n = rng.poisson(lam * dt, n_paths)
            jmp = n * jump["mean"] + np.sqrt(n) * jump["sd"] * rng.standard_normal(n_paths)
        r = -0.5 * vol ** 2 * dt + vol * np.sqrt(dt) * z + jmp
        s = s * np.exp(r)
        vol = np.clip(vol * np.exp(spot_vol_beta * r + 0.05 * rng.standard_normal(n_paths) * np.sqrt(dt * ppy / 30)),
                      sigma * 0.6, sigma * 2.0)
        val = book_value(legs, s, vol, r_d, r_f, hedge_units, dt=d / 365)
        eq = equity + (val - v0)
        mm = req_at(s, vol)
        newly = (called < 0) & (eq < mm)
        called[newly] = d
        liq = (liquidated < 0) & ((eq < liq_fraction * mm) | (eq <= 0))
        liquidated[liq] = d
        eq_path.append(np.quantile(eq, [0.01, 0.05, 0.5, 0.95]).tolist())
    p_call = float((called > 0).mean())
    p_liq = float((liquidated > 0).mean())
    hist = np.bincount(np.clip(called, 0, None), minlength=days + 1)[1:] / n_paths
    return {"p_margin_call": p_call, "p_liquidation": p_liq, "call_by_day": hist.tolist(),
            "median_days_to_call": float(np.median(called[called > 0])) if p_call > 0 else None,
            "equity_quantiles": eq_path, "days": days, "n_paths": n_paths,
            "req_grid": {"spot": s_grid.tolist(), "vol": vol_grid.tolist(), "req": req.tolist()}}


def liquidation_ladder(legs, S, sigma, r_d, r_f, equity, method, params, hedge_units=0.0, vol_mults=(1.0, 1.5)):
    """Spot levels (vol held at σ·mult) where equity first falls below the maintenance requirement."""
    v0 = float(book_value(legs, S, sigma, r_d, r_f, hedge_units))
    grid = S * np.linspace(0.4, 1.8, 141)
    out = []
    for m in vol_mults:
        vol = sigma * m
        eq = equity + book_value(legs, grid, np.full_like(grid, vol), r_d, r_f, hedge_units) - v0
        mm = np.array([requirement(method, legs, g, vol, r_d, r_f, hedge_units, params) for g in grid])
        bad = eq < mm
        i0 = int(np.argmin(np.abs(grid - S)))
        down = next((float(grid[i]) for i in range(i0, -1, -1) if bad[i]), None)
        up = next((float(grid[i]) for i in range(i0, len(grid)) if bad[i]), None)
        in_call = bool(bad[i0])
        if in_call:
            down = up = None
        out.append({"vol_mult": m, "in_call_now": in_call, "call_below": down, "call_above": up,
                    "spot": grid.tolist(), "equity": eq.tolist(), "maintenance": mm.tolist()})
    return out
