from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import greeks, surface, market, montecarlo, scenarios, strategies, export, forex, institutional, news, livedata

app = FastAPI(title="QuantRisk FX Terminal API",
              description="Forex options risk analytics — Garman-Kohlhagen model.",
              version="3.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for router in [greeks, surface, market, montecarlo, scenarios, strategies, export, forex, institutional, news, livedata]:
    app.include_router(router.router, prefix="/api")

@app.get("/")
def root():
    return {"status": "ok", "version": "3.0.0", "model": "Garman-Kohlhagen (1983)", "docs": "/docs"}
