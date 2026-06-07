from fastapi import APIRouter
from ..schemas import GreeksRequest
from ..core.greeks import portfolio_greeks

router = APIRouter(prefix="/greeks", tags=["greeks"])

@router.post("")
def compute_greeks(req: GreeksRequest):
    options = [o.model_dump() for o in req.options]
    return portfolio_greeks(options, req.S, req.sigma, req.T, req.r_d, req.r_f)
