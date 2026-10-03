from fastapi import APIRouter, HTTPException

from ..core.hedge_sim import hedge_report
from ..schemas import HedgeSimRequest
from .forex import PAIRS

router = APIRouter(prefix="/hedge", tags=["hedge"])

MAX_WORK = 2.5e7      # paths × steps cap to keep a request within a few seconds


@router.post("/simulate")
def simulate_hedge(req: HedgeSimRequest):
    """Monte Carlo delta-hedging / gamma-scalping P&L lab for the current portfolio."""
    pair = req.pair.upper()
    meta = PAIRS.get(pair)
    if meta is None:
        raise HTTPException(404, f"Unknown pair '{pair}'.")
    if not req.options:
        raise HTTPException(422, "Add at least one option leg.")
    ppy = meta["periods_per_year"]
    T = max(o.T for o in req.options)
    if T > 2:
        raise HTTPException(422, "Longest leg must expire within 2 years.")
    work = req.n_paths * max(1, round(T * ppy)) * req.steps_per_day
    if work > MAX_WORK:
        raise HTTPException(422, "Too many paths × steps — lower paths, hedge frequency or tenor.")

    hist = None
    if req.model == "bootstrap":
        from . import vol      # reuse the cached 2y daily closes
        import numpy as np
        try:
            load = (lambda: vol._crypto_closes(pair[:3])) if meta["asset_class"] == "crypto" \
                else (lambda: vol._yf_closes(meta["sym"]))
            closes = vol._cached(f"closes:{pair}", 900, load)
        except Exception as e:
            raise HTTPException(503, f"Price history unavailable for bootstrap: {e}")
        if len(closes) < 120:
            vol._cache.pop(f"closes:{pair}", None)
            raise HTTPException(503, "Not enough price history to bootstrap.")
        hist = np.diff(np.log(np.asarray(closes, dtype=float)))

    jump = {"lambda": req.jump.intensity, "mean": req.jump.mean, "sd": req.jump.sd}
    try:
        report = hedge_report(
            [o.model_dump() for o in req.options], req.S, req.sigma_implied, req.sigma_realised,
            req.r_d, req.r_f, ppy, model=req.model, steps_per_day=req.steps_per_day,
            rule=req.rule, band=req.band, cost_bps=req.cost_bps, n_paths=req.n_paths,
            jump=jump, weekend_gap=req.weekend_gap if ppy != 365 else 0.0,
            hist_returns=hist, rescale=req.rescale_bootstrap, sweep=req.sweep)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"pair": pair, "asset_class": meta["asset_class"], **report}
