<div align="center">

# ⚛ NEXUS TERMINAL

### Institutional-Grade FX Options Analytics Platform

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

*Three orbital rings. One terminal. Every market.*

![Landing Page](screenshots/01-landing.png)

</div>

---

## What is NEXUS?

NEXUS TERMINAL is a Bloomberg-style web application for professional forex options analysis. It combines **Garman-Kohlhagen options pricing**, **Goldman Sachs gs-quant signals**, **live global data feeds**, and a **real-time world map** — all in one free, no-account-required platform.

![Dashboard](screenshots/02-dashboard.png)

---

## Features

### Options Analytics
| Module | Description |
|--------|-------------|
| **Greeks Dashboard** | Δ Delta · Γ Gamma · ν Vega · Θ Theta · ρ Rho · φ Phi — per leg and portfolio total via Garman-Kohlhagen (1983) |
| **Volatility Surfaces** | Interactive 3D surface plots (Delta, Gamma, Vega, Theta, P&L) across full spot × vol grid |
| **Breakeven Profile** | Payoff curve at expiry with breakeven strikes, max profit/loss, net premium |
| **Scenario Analysis** | Stress tests across spot ±5%/±10% and vol ±1pp/±2pp shocks |
| **Monte Carlo** | GBM path simulation — up to 5,000 paths, terminal P&L distribution, probability of profit |
| **Strategy Library** | Pre-built multi-leg strategies: straddle, strangle, bull/bear spreads, iron condor, butterfly |
| **Vol Smile (Vanna-Volga)** | Builds the FX smile from ATM / 25Δ risk reversal / 25Δ butterfly quotes (Castagna-Mercurio) and reprices each leg off the smile vs flat vol |
| **Vol Lab** | Live Deribit BTC/ETH surface with a raw-SVI fit per expiry (Durrleman butterfly-arb check), ATM / 25Δ RR / 25Δ BF term structure, DVOL, vol risk premium, and a Burghardt-Lane realised-vol cone for every pair. Tests: `cd backend && python -m pytest tests` |
| **Vol Forecast & Regime (AI)** | HAR-RV (weekend-aware for crypto), GJR-GARCH and gradient-boosting forecasts of 1D/1W/1M vol, rolling out-of-sample QLIKE leaderboard with an inverse-QLIKE ensemble, 2-state HMM regime detection, and a forecast-vs-Deribit-implied rich/cheap signal |
| **Hedge Lab** | Monte Carlo delta-hedging / gamma-scalping P&L of your portfolio: realised vs implied vol, GBM / Merton jumps / historical block bootstrap, weekend gaps for 24/5 markets, time or delta-band hedging, transaction costs and carry, with Derman-Kamal and Leland benchmarks and a hedge-frequency risk-vs-cost sweep |
| **Risk Desk** | Market risk of the portfolio option book with full revaluation on joint spot × implied-vol history (Deribit DVOL, Cboe GVZ / VXSLV, else EWMA proxy): VaR 99% / ES 97.5% (FRTB) by historical, filtered-historical (EWMA-scaled), delta-gamma Cornish-Fisher, Student-t Monte Carlo and delta-normal; 1- and 10-day horizons; stressed window (worst 250 days); rolling backtest with Kupiec / Christoffersen tests and Basel traffic light; spot × vol ladder; worst-day and what-if P&L explain by Greek (Δ, Γ, vega, vanna, volga, θ, unexplained) |
| **Margin Desk** | Exchange margin for the option book: CME SPAN-style 16-scenario scan risk (price / vol scan, ±3× extreme at 33 %, short-option minimum; COMEX %-of-notional defaults) and Deribit-style portfolio margin (±16 % × vol-shock matrix, dampened extended table, delta contingency, MM = 0.8 × IM); margin-hike shock and cash call; equity-vs-maintenance ladder with call levels; Monte-Carlo margin-call and liquidation probabilities with jumps and spot-vol co-movement |
| **AI Hedger** | Deep hedging of a short option under proportional transaction costs and jumps, trained server-side in pure numpy (no GPU, no API key): a No-Transaction-Band network (Imaki et al. 2021, back-propagation through time) and a feed-forward deep hedge (Buehler et al. 2019) minimising CVaR, benchmarked out of sample against BS delta and a tuned Whalley-Wilmott band; regime-shift tests (vol +50%, crash jumps); learned band vs Whalley-Wilmott, P&L distributions, turnover, risk-adjusted price, training curves |
| **Cross-Asset Desk** | Gold · silver · BTC · ETH · EURUSD · DXY · US10Y · WTI correlation matrices (30D/90D/1Y/EWMA) with a correlation-break monitor; gold/silver ratio z-scores, OU half-life, Engle-Granger cointegration and Kalman hedge ratio; Margrabe outperformance-option pricer with correlation sensitivity |
| **Jump Lab** | Merton and Bates (Heston + jumps, COS pricing) calibrated to every live Deribit BTC/ETH expiry: model-vs-market smiles, fit RMSE, jump intensity/size, jump share of variance, crash-jump odds, 30-day risk-neutral density vs lognormal; manual Merton for metals/FX event and gap risk; one-click hand-off of jump parameters to Hedge Lab |
| **Event Vol** | Event & weekend "vol time" term structure: strips FOMC / CPI / NFP variance lumps and the weekend weight out of the ATM curve (live Deribit fit for BTC/ETH; assumptions or pasted broker quotes for XAU/XAG/EUR/any pair), event-implied moves and straddle breakevens, forward vols and calendar-arbitrage flags, fair vol for any expiry incl. 0DTE/1-day, built-in 2026 FOMC/CPI/NFP calendar merged with live Forex Factory events, realised day-of-week / weekend-weight / FOMC-lump study |
| **Positioning** | Live BTC / ETH options positioning from Deribit open interest: dealer gamma exposure (USD per 1% move) with switchable dealer-side convention, gamma profile across spot and gamma-flip level, call / put walls, vanna and charm flows, dealer delta, put/call, and per-expiry max pain, ATM IV and implied 1σ move |
| **Smile Dynamics** | SABR (Hagan 2002 + Obłój 2008) fitted per live Deribit expiry or to ATM / RR / BF quotes for any pair; hedge ratios under sticky strike, sticky delta, SABR and Bartlett (variance-optimal) dynamics at 10Δ–10Δ; model backbones (ATM vol change per 1% spot) vs the realised spot-vol beta from DVOL / GVZ / VXSLV with rolling correlation, and a regime call; ρ / ν term structure |
| **Exotics Desk** | Structured-products pricer: all eight single barriers (Reiner-Rubinstein/Haug, rebates) with Broadie-Glasserman-Kou discrete-monitoring correction, barrier price/delta profile through the barrier, touch ladder of hit probabilities, smile-consistent digitals (−∂C/∂K on the vanna-volga smile); Dual Currency Investment / crypto "Dual Investment" fair-APR ladder with an offer audit (platform margin, implied vol you are paid); KO accumulator Monte Carlo with zero-cost strike, KO odds and geared-loss tail, optional Merton jumps |
| **TARF Desk** | Target redemption forwards (importer buys / exporter sells, leverage, full / exact / no-payout target) priced side by side under flat vol, Dupire local vol from an arbitrage-free SSVI surface calibrated to ATM / RR / BF, and Merton jumps: zero-cost strike, model-risk spread, knock-out timing and survival, expected cash flows per fixing, client P&L distribution and ES vs the capped gain, delta / vega |

### Live Intelligence

![AI Signals](screenshots/03-ai-signals.png)

| Module | Description |
|--------|-------------|
| **AI Quant Signals** | 9 signals: RSI, MACD, Bollinger Bands, Hurst exponent, mean reversion (OU), momentum, carry, volatility regime — powered by gs-quant |
| **Institutional Flow** | CFTC COT positioning — Asset Managers, Hedge Funds, Dealers — with Volume Profile, POC, VAH, VAL |
| **Economic Calendar** | Forex Factory events (120+ per week) with impact levels, forecasts, countdowns, and currency filters |

### Live World Map

![Live Map](screenshots/04-live-map.png)

| Layer | Source | Refresh |
|-------|--------|---------|
| ✈ Aircraft positions | OpenSky Network (free, anonymous) | 30s |
| 🔴 Earthquake markers | USGS GeoJSON feed (M4.5+, 7 days) | 5min |
| 🌦 Weather radar | RainViewer animated tiles | on-demand |
| 📍 Forex events | Forex Factory via backend cache | with calendar |

### Live Feeds

![Live Feeds](screenshots/05-live-feeds.png)

- **Crypto prices** — Top 12 by market cap via CoinGecko free API, 60s refresh
- **Global webcams** — Windy.com live camera feeds for 6 financial centers: New York · London · Tokyo · Frankfurt · Singapore · Dubai

### Economic Calendar

![Calendar](screenshots/06-calendar.png)

---

## Tech Stack

```
NEXUS TERMINAL
├── backend/                  FastAPI (Python 3.11+)
│   └── app/
│       ├── core/             Garman-Kohlhagen · Greeks · Monte Carlo · Quant Analysis
│       └── routers/          REST API endpoints
│           ├── greeks.py     Options pricing & Greeks
│           ├── surface.py    Volatility surface grid
│           ├── montecarlo.py GBM simulation
│           ├── scenarios.py  Stress testing
│           ├── forex.py      Live FX rates
│           ├── institutional.py  CFTC COT data
│           ├── news.py       Forex Factory calendar
│           └── livedata.py   Aircraft & earthquake proxy
│
└── frontend/                 React 18 + Vite 5
    └── src/
        ├── components/
        │   ├── GreeksDashboard.jsx
        │   ├── QuantSignals.jsx    (gs-quant AI signals)
        │   ├── WorldMap.jsx        (Leaflet + live layers)
        │   ├── LiveFeeds.jsx       (Crypto + Webcams)
        │   ├── EconomicCalendar.jsx
        │   ├── InstitutionalFlow.jsx
        │   └── NexusLogo.jsx       (animated SVG + canvas favicon)
        └── pages/
            ├── LandingPage.jsx
            └── Dashboard.jsx
```

### Key Libraries

**Backend**
- `fastapi` — REST API framework
- `gs-quant` — Goldman Sachs quant library (RSI, MACD, Bollinger, volatility)
- `numpy` / `scipy` — Monte Carlo, OU process, Hurst exponent
- `httpx` — Async HTTP client for proxying live data

**Frontend**
- `react-leaflet` + `leaflet` — Interactive world map with live layers
- `plotly.js` — 3D volatility surface plots
- `zustand` — Global portfolio state management
- `JetBrains Mono` — Bloomberg-terminal monospace font

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API available at `http://localhost:8000` · Docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/greeks` | Compute portfolio Greeks (Garman-Kohlhagen) |
| `POST` | `/api/surface` | Generate volatility surface grid |
| `POST` | `/api/montecarlo` | Run GBM Monte Carlo simulation |
| `POST` | `/api/scenarios` | Stress-test scenario matrix |
| `GET`  | `/api/forex/rates` | Live FX spot rates |
| `GET`  | `/api/news/calendar` | Forex Factory economic calendar |
| `GET`  | `/api/institutional/{pair}` | CFTC COT positioning data |
| `GET`  | `/api/signals/{pair}` | AI quant signals (gs-quant) |
| `GET`  | `/api/live/aircraft` | Live aircraft positions (OpenSky proxy) |
| `GET`  | `/api/live/earthquakes` | USGS earthquake feed proxy |

---

## Design System

NEXUS uses a Bloomberg terminal-inspired design:
- **Colors** — Navy dark (`#080e1a`) base, cyan (`#00c8f0`) accent, semantic red/green/amber/purple
- **Typography** — JetBrains Mono for all data panels, `tabular-nums` for price columns
- **Panels** — 3px left-border accent system (worldmonitor-style)
- **Tokens** — `color-mix(in srgb, ...)` for semi-transparent semantic backgrounds

---

## Data Sources

| Source | Data | Cost |
|--------|------|------|
| Goldman Sachs gs-quant | RSI, MACD, Bollinger, volatility | Free (open-source) |
| OpenSky Network | Live aircraft positions | Free, anonymous |
| USGS Earthquake API | M4.5+ seismic events | Free |
| RainViewer | Weather radar tiles | Free |
| Forex Factory | Economic calendar (120+ events/week) | Free |
| CoinGecko | Crypto prices (top 12) | Free |
| Windy.com | Global webcam feeds | Free embed |
| Yahoo Finance (via yfinance) | FX historical rates | Free |

---

## License

MIT © 2026 — Built with ⚛ NEXUS TERMINAL
