from fastapi import APIRouter
from ..schemas import ScenarioRequest
from ..core.garman_kohlhagen import gk_price

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

@router.post("")
def compute_scenarios(req: ScenarioRequest):
    options = [o.model_dump() for o in req.options]

    def portfolio_value(S, sigma):
        return sum(
            gk_price(S, opt["K"], opt.get("T", req.T), req.r_d, req.r_f, sigma, opt["type"])
            * opt["qty"] for opt in options
        )

    base = portfolio_value(req.S0, req.sigma0)
    results = []
    for shock in req.shocks:
        S_s = req.S0 * (1 + shock.dS_pct)
        vol_s = max(0.005, req.sigma0 + shock.dVol)
        pnl = portfolio_value(S_s, vol_s) - base
        results.append({
            "label": shock.label,
            "dS_pct": shock.dS_pct, "dVol": shock.dVol,
            "S_shocked": round(S_s, 5), "vol_shocked": round(vol_s, 4),
            "pnl": round(pnl, 5),
            "pnl_pct": round(pnl / abs(base) * 100, 2) if base else 0,
        })
    return {"base_value": round(base, 5), "scenarios": results}
