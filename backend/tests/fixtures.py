import numpy as np
from datetime import datetime, timezone, timedelta
from app.core.vol_analytics import svi_total_variance
NOW = datetime(2026, 9, 29, 5, 0, tzinfo=timezone.utc)
NOW_MS = NOW.timestamp() * 1000
MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
def deribit_book(spot=83000.0, r=0.04, ccy="BTC", rng=None, noise=0.0):
    """Deribit-shaped book summaries from a known SVI surface (BTC-like skew)."""
    rng = rng or np.random.default_rng(1)
    rows, truth = [], {}
    for days in [2, 9, 30, 58, 93, 184, 275]:
        exp = (NOW + timedelta(days=days)).replace(hour=8, minute=0)
        T = (exp - NOW).total_seconds() / (365*86400)
        F = spot * np.exp(r * T)
        atm = 0.38 + 0.04 * np.sqrt(T)             # upward term structure
        p = (atm**2*T*0.8, 0.12*np.sqrt(T), -0.25, 0.02, 0.15)   # a,b,rho,m,sig
        # rescale a so w(0)=atm^2 T
        w0 = svi_total_variance(0, *p); p = (p[0] + atm**2*T - w0,) + p[1:]
        truth[exp.strftime("%Y-%m-%d")] = (p, T, F)
        step = 1000 if ccy == "BTC" else 50
        for K in np.arange(round(F*0.55/step)*step, F*1.8, step * (1 if T > 0.1 else 1)):
            k = np.log(K/F); iv = np.sqrt(svi_total_variance(k, *p)/T)
            if abs(k) > 3.5*atm*np.sqrt(T) + 0.1: continue
            for cp in "CP":
                name = f"{ccy}-{exp.day}{MON[exp.month-1]}{exp.strftime('%y')}-{int(K)}-{cp}"
                rows.append({"instrument_name": name, "mark_iv": round(100*iv*(1+noise*rng.standard_normal()), 2),
                             "underlying_price": F, "underlying_index": f"{ccy}-{exp.strftime('%d%b%y').upper()}",
                             "open_interest": float(rng.integers(0, 500)), "mark_price": 0.01})
    return rows, truth
