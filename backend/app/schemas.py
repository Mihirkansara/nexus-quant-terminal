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
