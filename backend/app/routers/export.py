import io, csv
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..schemas import GreeksRequest
from ..core.greeks import portfolio_greeks
from ..core.garman_kohlhagen import gk_price

router = APIRouter(prefix="/export", tags=["export"])

@router.post("/csv")
def export_csv(req: GreeksRequest):
    options = [o.model_dump() for o in req.options]
    result = portfolio_greeks(options, req.S, req.sigma, req.T, req.r_d, req.r_f)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["QUANTRISK FX — GARMAN-KOHLHAGEN GREEKS REPORT"])
    w.writerow(["Spot", req.S, "Sigma", req.sigma, "T", req.T,
                "r_d", req.r_d, "r_f", req.r_f])
    w.writerow([])
    w.writerow(["PORTFOLIO TOTALS"])
    w.writerow(["Greek", "Value", "Description"])
    desc = {"delta":"Price sensitivity","gamma":"Delta curvature","vega":"Vol sensitivity",
            "theta":"Time decay/yr","rho_d":"Dom rate sensitivity","phi":"For rate sensitivity"}
    for k, v in result["total"].items():
        w.writerow([k.upper(), v, desc.get(k,"")])
    w.writerow([])
    w.writerow(["LEG BREAKDOWN"])
    w.writerow(["Leg","Delta","Gamma","Vega","Theta"])
    for leg in result["legs"]:
        w.writerow([leg["label"],leg["delta"],leg["gamma"],leg["vega"],leg["theta"]])
    w.writerow([])
    w.writerow(["OPTION PRICES (Garman-Kohlhagen)"])
    w.writerow(["Leg","GK Price"])
    for opt in options:
        price = gk_price(req.S, opt["K"], opt.get("T",req.T), req.r_d, req.r_f,
                         req.sigma, opt["type"])
        w.writerow([f"{opt['type'].upper()} K={opt['K']} qty={opt['qty']}", round(price,5)])
    out.seek(0)
    return StreamingResponse(
        io.BytesIO(out.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gk_greeks_report.csv"},
    )
