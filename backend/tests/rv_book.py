"""Synthetic Deribit book priced exactly with Black-76 (coin premiums) on a known SVI smile."""

from datetime import datetime, timedelta, timezone

import numpy as np

from app.core.rv_scanner import black76_coin
from app.core.vol_analytics import svi_total_variance

NOW = datetime(2026, 10, 25, 5, 0, tzinfo=timezone.utc)
NOW_MS = NOW.timestamp() * 1000
MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def name(ccy, exp, K, cp):
    return f"{ccy}-{exp.day}{MON[exp.month - 1]}{exp.strftime('%y')}-{int(K)}-{cp}"


def book(spot=83000.0, ccy="BTC", spread_vol=0.005, basis=0.06, days_list=(9, 30, 58)):
    opts, futs = [], []
    for days in days_list:
        exp = (NOW + timedelta(days=days)).replace(hour=8, minute=0)
        T = (exp - NOW).total_seconds() / (365 * 86400)
        F = spot * (1 + basis * T)
        atm = 0.45
        p = (atm ** 2 * T * 0.8, 0.1 * np.sqrt(T), -0.3, 0.0, 0.15)
        w0 = svi_total_variance(0, *p)
        p = (p[0] + atm ** 2 * T - w0,) + p[1:]
        for K in np.arange(round(F * 0.7 / 1000) * 1000, F * 1.4, 1000.0):
            iv = float(np.sqrt(svi_total_variance(np.log(K / F), *p) / T))
            for cp in "CP":
                call = cp == "C"
                mark = black76_coin(F, K, T, iv, call)
                bid = black76_coin(F, K, T, iv - spread_vol, call)
                ask = black76_coin(F, K, T, iv + spread_vol, call)
                opts.append({"instrument_name": name(ccy, exp, K, cp), "mark_iv": iv * 100, "underlying_price": F,
                             "mark_price": mark, "bid_price": bid, "ask_price": ask, "open_interest": 100.0})
        futs.append({"instrument_name": f"{ccy}-{exp.day}{MON[exp.month - 1]}{exp.strftime('%y')}", "mark_price": F})
    futs.append({"instrument_name": f"{ccy}-PERPETUAL", "mark_price": spot * 1.0002, "funding_8h": 0.0001})
    return opts, futs
