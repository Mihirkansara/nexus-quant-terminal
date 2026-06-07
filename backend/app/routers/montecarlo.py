from fastapi import APIRouter
from ..schemas import MonteCarloRequest
from ..core.montecarlo import run_montecarlo

router = APIRouter(prefix="/montecarlo", tags=["montecarlo"])

@router.post("")
def monte_carlo(req: MonteCarloRequest):
    options = [o.model_dump() for o in req.options]
    return run_montecarlo(options, req.S0, req.sigma, req.r_d, req.r_f,
                          req.T, req.n_paths, req.n_steps)
