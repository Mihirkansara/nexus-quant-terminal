from pydantic import BaseModel, Field
from typing import Literal


class OptionLeg(BaseModel):
    type: Literal["call", "put"]
    K: float = Field(..., gt=0, description="Strike price (exchange rate)")
    T: float = Field(..., gt=0, description="Time to expiry in years")
    qty: float = Field(..., description="Signed quantity (positive=long)")


class GreeksRequest(BaseModel):
    options: list[OptionLeg]
    S: float = Field(..., gt=0, description="Spot exchange rate")
    sigma: float = Field(..., gt=0, lt=5)
    T: float = Field(..., gt=0)
    r_d: float = Field(default=0.0525, description="Domestic risk-free rate")
    r_f: float = Field(default=0.0400, description="Foreign risk-free rate")


class SurfaceRequest(BaseModel):
    options: list[OptionLeg]
    S_low: float = Field(default=0.0)
    S_high: float = Field(default=0.0)
    S_steps: int = Field(default=40)
    vol_low: float = Field(default=0.05)
    vol_high: float = Field(default=0.30)
    vol_steps: int = Field(default=40)
    T: float = Field(default=0.5)
    r_d: float = Field(default=0.0525)
    r_f: float = Field(default=0.0400)


class MonteCarloRequest(BaseModel):
    options: list[OptionLeg]
    S0: float = Field(..., gt=0)
    sigma: float = Field(..., gt=0)
    r_d: float = Field(default=0.0525)
    r_f: float = Field(default=0.0400)
    T: float = Field(..., gt=0)
    n_paths: int = Field(default=1000, ge=100, le=10000)
    n_steps: int = Field(default=100, ge=10, le=500)


class ScenarioShock(BaseModel):
    label: str
    dS_pct: float
    dVol: float


class ScenarioRequest(BaseModel):
    options: list[OptionLeg]
    S0: float
    sigma0: float
    T: float
    r_d: float = 0.0525
    r_f: float = 0.0400
    shocks: list[ScenarioShock] = Field(default_factory=lambda: [
        ScenarioShock(label="Flash Crash",    dS_pct=-0.03, dVol=0.08),
        ScenarioShock(label="Sharp Sell-off", dS_pct=-0.015,dVol=0.04),
        ScenarioShock(label="Mild Weakness",  dS_pct=-0.005,dVol=0.01),
        ScenarioShock(label="Base Case",      dS_pct=0.00,  dVol=0.00),
        ScenarioShock(label="Mild Strength",  dS_pct=0.005, dVol=-0.01),
        ScenarioShock(label="Sharp Rally",    dS_pct=0.015, dVol=-0.03),
        ScenarioShock(label="Breakout",       dS_pct=0.03,  dVol=-0.05),
    ])


class SmileRequest(BaseModel):
    S: float = Field(..., gt=0, description="Spot exchange rate")
    T: float = Field(..., gt=0, description="Tenor in years")
    r_d: float = Field(default=0.0525)
    r_f: float = Field(default=0.0400)
    atm: float = Field(..., gt=0, lt=5, description="ATM delta-neutral straddle vol")
    rr25: float = Field(default=0.0, gt=-1, lt=1, description="25Δ risk reversal (call − put vol)")
    bf25: float = Field(default=0.0, gt=-1, lt=1, description="25Δ butterfly")
    sigma: float | None = Field(default=None, gt=0, lt=5, description="Flat vol to compare against (defaults to ATM)")
    options: list[OptionLeg] = Field(default_factory=list)


class JumpParams(BaseModel):
    intensity: float = Field(default=12.0, ge=0, le=365, description="Jumps per year")
    mean: float = Field(default=-0.01, gt=-0.5, lt=0.5, description="Mean log jump size")
    sd: float = Field(default=0.05, ge=0, lt=1, description="Log jump size st. dev.")


class HedgeSimRequest(BaseModel):
    pair: str = Field(default="EURUSD", description="Selects the calendar (365 crypto / 252 otherwise) and bootstrap history")
    options: list[OptionLeg]
    S: float = Field(..., gt=0)
    sigma_implied: float = Field(..., gt=0, lt=5, description="Vol the options are traded and hedged at")
    sigma_realised: float = Field(..., gt=0, lt=5, description="Vol the market actually delivers")
    r_d: float = Field(default=0.0525)
    r_f: float = Field(default=0.0400)
    model: Literal["gbm", "jump", "bootstrap"] = "gbm"
    steps_per_day: Literal[1, 2, 4, 8, 24] = 1
    rule: Literal["time", "band"] = "time"
    band: float = Field(default=0.05, gt=0, le=1, description="No-trade band, delta per unit of option notional")
    cost_bps: float = Field(default=0.0, ge=0, le=100, description="One-way cost, bps of traded notional")
    n_paths: int = Field(default=2000, ge=200, le=5000)
    jump: JumpParams = Field(default_factory=JumpParams)
    weekend_gap: float = Field(default=0.0, ge=0, lt=0.5, description="Weekend-gap sd (fraction of spot), 24/5 assets")
    rescale_bootstrap: bool = True
    sweep: bool = True
