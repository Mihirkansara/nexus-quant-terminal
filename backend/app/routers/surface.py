import numpy as np
from fastapi import APIRouter
from ..schemas import SurfaceRequest
from ..core.surface import compute_surfaces

router = APIRouter(prefix="/surface", tags=["surface"])

@router.post("")
def compute_surface(req: SurfaceRequest):
    options = [o.model_dump() for o in req.options]
    # If caller didn't set S range, default to ±20% around midpoint — handled frontend-side
    S_range = np.linspace(req.S_low, req.S_high, req.S_steps)
    sigma_range = np.linspace(req.vol_low, req.vol_high, req.vol_steps)
    return compute_surfaces(options, S_range, sigma_range, req.T, req.r_d, req.r_f)
