"""
exotics.py — Exotics & structured products for FX, metals and crypto:
single barriers, touches, smile-consistent digitals, Dual Currency Investments
(crypto "Dual Investment") and accumulators.

Conventions: Garman-Kohlhagen with r = r_d (domestic / quote currency) and
cost of carry b = r_d − r_f (r_f = foreign rate, metal lease rate, ≈0 for crypto).
Prices are in quote currency per unit of base.

1. Single barriers — Reiner & Rubinstein (1991) closed forms in Haug's A–F notation
   (all eight in/out × up/down × call/put, with rebates: knock-ins pay the rebate at
   expiry if never knocked in, knock-outs pay it at the hit). Discrete monitoring
   via the Broadie-Glasserman-Kou (1997) shift H → H·e^{±0.5826·σ√Δt}
   (away from spot).
2. Touches: one-touch paying at hit (Haug's F with unit rebate), one-touch paying at
   expiry and no-touch (from the knock-in rebate term E).
3. Digitals: cash-or-nothing e^{−rT}N(±d₂), smile-consistent version
   −∂C/∂K = BS digital ∓ vega·∂σ/∂K (Breeden-Litzenberger), with σ(K) from a
   vanna-volga smile built on ATM / 25Δ RR / 25Δ BF quotes.
4. Dual Currency Investment: deposit + short option. "Sell high" = deposit base,
   short call struck K (converts to quote if S_T ≥ K); "buy low" = deposit quote,
   short put (converts to base if S_T ≤ K). Fair APR = deposit rate + premium/T.
5. Accumulator (KO forward accumulation): buy q units at strike K on every fixing,
   2q (gearing) when the fixing is below K, the contract knocks out when a fixing
   is ≥ KO. Monte Carlo under GBM or Merton jumps; zero-cost strike by root search.

References:
    Reiner, E. & Rubinstein, M. (1991). "Breaking down the barriers." Risk 4(8).
    Haug, E. (2007). The Complete Guide to Option Pricing Formulas, 2nd ed., §4.17.
    Broadie, M., Glasserman, P. & Kou, S. (1997). Mathematical Finance, 7(4), 325–349.
    Breeden, D. & Litzenberger, R. (1978). Journal of Business, 51(4), 621–651.
    Wystup, U. (2017). FX Options and Structured Products, 2nd ed. (DCDs, accumulators).
"""

import numpy as np
from scipy.optimize import brentq
from scipy.stats import norm

BGK_BETA = 0.5826                      # −ζ(1/2)/√(2π)


# ─── vanilla & building blocks ────────────────────────────────────────────────

def gk_vanilla(S, K, T, r_d, r_f, sigma, is_call=True):
    sq = sigma * np.sqrt(T)
    d1 = (np.log(S / K) + (r_d - r_f + 0.5 * sigma ** 2) * T) / sq
    d2 = d1 - sq
    if is_call:
        return S * np.exp(-r_f * T) * norm.cdf(d1) - K * np.exp(-r_d * T) * norm.cdf(d2)
    return K * np.exp(-r_d * T) * norm.cdf(-d2) - S * np.exp(-r_f * T) * norm.cdf(-d1)


def bgk_barrier(H, S, sigma, n_obs_per_year):
    """Continuous-equivalent barrier for discrete monitoring (shifted away from spot)."""
    if not n_obs_per_year:
        return H
    shift = np.exp(BGK_BETA * sigma * np.sqrt(1.0 / n_obs_per_year))
    return H * shift if H > S else H / shift


def _terms(S, X, H, T, r, b, sigma, phi, eta, rebate):
    sq = sigma * np.sqrt(T)
    mu = (b - 0.5 * sigma ** 2) / sigma ** 2
    lam = np.sqrt(mu ** 2 + 2 * r / sigma ** 2)
    x1 = np.log(S / X) / sq + (1 + mu) * sq
    x2 = np.log(S / H) / sq + (1 + mu) * sq
    y1 = np.log(H * H / (S * X)) / sq + (1 + mu) * sq
    y2 = np.log(H / S) / sq + (1 + mu) * sq
    z = np.log(H / S) / sq + lam * sq
    fwd = S * np.exp((b - r) * T)
    dk = X * np.exp(-r * T)
    hs = H / S
    N = norm.cdf
    A = phi * fwd * N(phi * x1) - phi * dk * N(phi * x1 - phi * sq)
    B = phi * fwd * N(phi * x2) - phi * dk * N(phi * x2 - phi * sq)
    C = phi * fwd * hs ** (2 * (mu + 1)) * N(eta * y1) - phi * dk * hs ** (2 * mu) * N(eta * y1 - eta * sq)
    D = phi * fwd * hs ** (2 * (mu + 1)) * N(eta * y2) - phi * dk * hs ** (2 * mu) * N(eta * y2 - eta * sq)
    E = rebate * np.exp(-r * T) * (N(eta * x2 - eta * sq) - hs ** (2 * mu) * N(eta * y2 - eta * sq))
    F = rebate * (hs ** (mu + lam) * N(eta * z) + hs ** (mu - lam) * N(eta * z - 2 * eta * lam * sq))
    return A, B, C, D, E, F


def barrier_price(S, K, H, T, r_d, r_f, sigma, is_call=True, direction="down", knock="out",
                  rebate=0.0, monitoring_per_year=None):
    """
    Reiner-Rubinstein single barrier (Haug A–F). direction: "down"|"up", knock: "in"|"out".
    Already-breached barriers return the vanilla (knock-in) or the rebate (knock-out).
    monitoring_per_year: e.g. 252 for daily fixings (BGK correction); None = continuous.
    """
    up = direction == "up"
    if (up and S >= H) or (not up and S <= H):
        if knock == "in":
            return float(gk_vanilla(S, K, T, r_d, r_f, sigma, is_call))
        return float(rebate)
    Hc = bgk_barrier(H, S, sigma, monitoring_per_year)
    r, b = r_d, r_d - r_f
    phi = 1 if is_call else -1
    eta = -1 if up else 1
    A, B, C, D, E, F = _terms(S, K, Hc, T, r, b, sigma, phi, eta, rebate)
    hi = K > Hc
    table = {
        ("call", "down", "in"): C + E if hi else A - B + D + E,
        ("call", "up", "in"): A + E if hi else B - C + D + E,
        ("put", "down", "in"): B - C + D + E if hi else A + E,
        ("put", "up", "in"): A - B + D + E if hi else C + E,
        ("call", "down", "out"): A - C + F if hi else B - D + F,
        ("call", "up", "out"): F if hi else A - B + C - D + F,
        ("put", "down", "out"): A - B + C - D + F if hi else F,
        ("put", "up", "out"): B - D + F if hi else A - C + F,
    }
    return float(max(table[("call" if is_call else "put", direction, knock)], 0.0))


def touch_prices(S, H, T, r_d, r_f, sigma, payout=1.0, monitoring_per_year=None):
    """One-touch (paid at hit / at expiry) and no-touch on barrier H, plus hit probability."""
    up = H > S
    Hc = bgk_barrier(H, S, sigma, monitoring_per_year)
    eta = -1 if up else 1
    *_, E, F = _terms(S, S, Hc, T, r_d, r_d - r_f, sigma, 1, eta, payout)
    df = np.exp(-r_d * T)
    no_touch = float(max(E, 0.0))
    return {"one_touch_at_hit": float(F), "one_touch_at_expiry": float(payout * df - no_touch),
            "no_touch": no_touch, "prob_touch": float(1 - no_touch / (payout * df)),
            "barrier_used": float(Hc)}


def digital_prices(S, K, T, r_d, r_f, sigma, smile_vol=None, smile_slope=0.0, payout=1.0):
    """Cash-or-nothing call/put: flat-vol and smile-consistent (−∂C/∂K) values."""
    vol = smile_vol if smile_vol else sigma
    sq = vol * np.sqrt(T)
    d1 = (np.log(S / K) + (r_d - r_f + 0.5 * vol ** 2) * T) / sq
    d2 = d1 - sq
    df = np.exp(-r_d * T)
    bs_call = df * norm.cdf(d2)
    vega = S * np.exp(-r_f * T) * norm.pdf(d1) * np.sqrt(T)
    call_smile = bs_call - vega * smile_slope            # dC/dK = −digital + vega·σ'(K)
    sq0 = sigma * np.sqrt(T)
    flat = df * norm.cdf((np.log(S / K) + (r_d - r_f - 0.5 * sigma ** 2) * T) / sq0)
    return {"call_flat": float(payout * flat), "put_flat": float(payout * (df - flat)),
            "call_smile": float(payout * call_smile), "put_smile": float(payout * (df - call_smile)),
            "smile_adjustment": float(payout * (call_smile - flat))}


# ─── Dual Currency Investment ─────────────────────────────────────────────────

def dci_quote(S, K, T, r_d, r_f, sigma, side="sell_high", offered_apr=None):
    """
    Fair APR of a DCI and the conversion odds.
    sell_high: deposit 1 unit of base (e.g. 1 BTC), short a call at K (paid in base terms).
    buy_low:   deposit K units of quote (e.g. USD), short a put at K, paid in quote terms.
    """
    if side == "sell_high":
        prem = gk_vanilla(S, K, T, r_d, r_f, sigma, True) / S        # base-currency premium per 1 base
        base_rate = r_f
        conv = gk_prob(S, K, T, r_d, r_f, sigma, above=True)
    else:
        prem = gk_vanilla(S, K, T, r_d, r_f, sigma, False) / K       # quote premium per 1 quote deposited
        base_rate = r_d
        conv = gk_prob(S, K, T, r_d, r_f, sigma, above=False)
    fair_apr = base_rate + prem / T
    out = {"premium_pct": float(prem * 100), "deposit_rate": float(base_rate),
           "fair_apr": float(fair_apr), "prob_conversion": float(conv),
           "breakeven": float(K * (1 + prem) if side == "sell_high" else K * (1 - prem))}
    if offered_apr is not None:
        out["offered_apr"] = offered_apr
        out["margin_apr"] = float(fair_apr - offered_apr)
        # Vol at which the offered APR would be fair (the vol the platform is paying you).
        def gap(v):
            return dci_quote(S, K, T, r_d, r_f, v, side)["fair_apr"] - offered_apr
        try:
            out["implied_vol_paid"] = float(brentq(gap, 1e-3, 5.0))
        except ValueError:
            out["implied_vol_paid"] = None
    return out


def gk_prob(S, K, T, r_d, r_f, sigma, above=True):
    d2 = (np.log(S / K) + (r_d - r_f - 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    return float(norm.cdf(d2) if above else norm.cdf(-d2))


# ─── Accumulator ──────────────────────────────────────────────────────────────

def simulate_paths(S, T, r_d, r_f, sigma, n_steps, n_paths, rng, jump=None):
    dt = T / n_steps
    mu = r_d - r_f
    comp, jumps, sd = 0.0, 0.0, sigma
    if jump and jump.get("lambda", 0) > 0:
        lam, mj, sj = jump["lambda"], jump["mean"], jump["sd"]
        comp = lam * (np.exp(mj + 0.5 * sj ** 2) - 1)
        counts = rng.poisson(lam * dt, (n_paths, n_steps))
        jumps = counts * mj + np.sqrt(counts) * sj * rng.standard_normal((n_paths, n_steps))
    z = rng.standard_normal((n_paths, n_steps))
    x = (mu - comp - 0.5 * sd ** 2) * dt + sd * np.sqrt(dt) * z + jumps
    return S * np.exp(np.cumsum(x, axis=1))


def accumulator_value(paths, K, KO, T, r_d, qty=1.0, gearing=2.0):
    """PV to the client (long) per path, accumulated quantity, KO flags/times."""
    n_paths, n = paths.shape
    t = np.arange(1, n + 1) * T / n
    df = np.exp(-r_d * t)
    ko_hit = paths >= KO
    first = np.where(ko_hit.any(axis=1), ko_hit.argmax(axis=1), n)        # index of KO fixing
    alive = np.arange(n)[None, :] < first[:, None]                         # fixings strictly before KO
    q = np.where(paths < K, gearing * qty, qty) * alive
    pv = (q * (paths - K) * df[None, :]).sum(axis=1)
    return pv, q.sum(axis=1), first < n, np.where(first < n, (first + 1) * T / n, np.nan)


def accumulator_report(S, T, r_d, r_f, sigma, ko_pct=105.0, strike_pct=None, qty=1.0,
                       gearing=2.0, fixings_per_year=252, n_paths=20000, seed=11, jump=None):
    n = max(1, int(round(T * fixings_per_year)))
    rng = np.random.default_rng(seed)
    paths = simulate_paths(S, T, r_d, r_f, sigma, n, n_paths, rng, jump)
    KO = S * ko_pct / 100

    def pv_mean(K):
        return accumulator_value(paths, K, KO, T, r_d, qty, gearing)[0].mean()

    zero_cost_K = brentq(pv_mean, S * 0.3, KO * 0.999)
    K = S * strike_pct / 100 if strike_pct else zero_cost_K
    pv, qsum, ko, t_ko = accumulator_value(paths, K, KO, T, r_d, qty, gearing)
    # Client P&L at maturity if the accumulated units are marked at the final fixing.
    final_mtm = np.zeros(n_paths)
    t = np.arange(1, n + 1) * T / n
    first = np.where(paths >= KO, 1, 0).argmax(axis=1)
    first = np.where((paths >= KO).any(axis=1), first, n)
    alive = np.arange(n)[None, :] < first[:, None]
    q = np.where(paths < K, gearing * qty, qty) * alive
    end_px = np.where(first < n, paths[np.arange(n_paths), np.minimum(first, n - 1)], paths[:, -1])
    final_mtm = (q * (end_px[:, None] - K)).sum(axis=1)
    hist_c, hist_e = np.histogram(final_mtm, bins=40)
    sample = paths[:6, :: max(1, n // 120)]
    return {
        "n_fixings": n, "ko_level": float(KO), "zero_cost_strike": float(zero_cost_K),
        "zero_cost_strike_pct": float(zero_cost_K / S * 100), "strike": float(K),
        "pv_to_client": float(pv.mean()), "pv_se": float(pv.std() / np.sqrt(n_paths)),
        "expected_units": float(qsum.mean()), "max_units": float(gearing * qty * n),
        "prob_knock_out": float(ko.mean()),
        "expected_ko_days": float(np.nanmean(t_ko) * 365) if ko.any() else None,
        "pnl": {"mean": float(final_mtm.mean()), "p05": float(np.quantile(final_mtm, 0.05)),
                "p01": float(np.quantile(final_mtm, 0.01)),
                "es05": float(final_mtm[final_mtm <= np.quantile(final_mtm, 0.05)].mean()),
                "prob_loss": float((final_mtm < 0).mean())},
        "histogram": {"centers": (0.5 * (hist_e[1:] + hist_e[:-1])).tolist(), "counts": hist_c.tolist()},
        "sample_paths": sample.tolist(),
    }


def barrier_mc(S, K, H, T, r_d, r_f, sigma, is_call, direction, knock, rebate=0.0,
               n_steps=252, n_paths=200_000, seed=3):
    """Monte Carlo check with discrete monitoring at n_steps fixings (knock-out rebate at hit)."""
    rng = np.random.default_rng(seed)
    paths = simulate_paths(S, T, r_d, r_f, sigma, n_steps, n_paths, rng)
    hit = (paths >= H) if direction == "up" else (paths <= H)
    touched = hit.any(axis=1)
    ST = paths[:, -1]
    pay = np.maximum(ST - K, 0) if is_call else np.maximum(K - ST, 0)
    df = np.exp(-r_d * T)
    if knock == "out":
        idx = hit.argmax(axis=1)
        t_hit = (idx + 1) * T / n_steps
        v = np.where(touched, rebate * np.exp(-r_d * t_hit), pay * df)
    else:
        v = np.where(touched, pay * df, rebate * df)
    return float(v.mean()), float(v.std() / np.sqrt(n_paths))
