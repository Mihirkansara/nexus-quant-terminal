from fastapi import APIRouter, HTTPException
from ..schemas import SmileRequest
from ..core.vanna_volga import build_smile

router = APIRouter(prefix="/smile", tags=["smile"])

@router.post("")
def compute_smile(req: SmileRequest):
    options = [o.model_dump() for o in req.options]
    try:
        return build_smile(req.S, req.T, req.r_d, req.r_f, req.atm, req.rr25, req.bf25,
                           options=options, flat_sigma=req.sigma)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
