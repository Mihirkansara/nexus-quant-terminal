# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Active options traders running real books in FX, crypto (BTC/ETH on Deribit) and precious metals (XAU/XAG). They open Nexus during the trading day to price structures, read the vol surface, size hedges, and check risk and margin before and after they trade. They return many times a session, know the vocabulary (Greeks, SVI, SABR, VaR/ES, GEX, TARF), and judge a tool by how fast it puts the right number in front of them.

## Product Purpose

Nexus Terminal gives a single trader the analytics of an institutional options desk in a browser: pricing, volatility modelling, hedging, risk, margin, positioning and live market context in one place, free of a Bloomberg seat. Success is a trader who keeps Nexus open all day because it answers "what is my book doing and what should I do about it" faster than their alternatives.

## Positioning

Desk-grade models with their working shown: full-revaluation VaR/ES with backtests, raw-SVI and SABR fits on live Deribit data, deep hedging trained server-side, SPAN-style margin, dealer GEX. Each module cites its method and literature, so traders can trust and audit the numbers rather than take a black box on faith.

## Operating Context

- Long sessions on desktop monitors, often beside a broker platform and charts; dense data read at a glance.
- One shared portfolio (pair, spot, vol, expiry, rates, option legs) in the left sidebar drives every module; switching modules must never lose it.
- The portfolio state serializes to the URL so a setup can be shared.
- Live data: Deribit (options, futures, DVOL), Yahoo Finance via yfinance, CFTC COT, Forex Factory calendar, news feeds, OpenSky/USGS/RainViewer for the live map.
- Access is gated by a login whose credentials are requested via LinkedIn DM.

## Capabilities and Constraints

- 28 modules today: Greeks, Chart, AI Signals, Vol Lab, Vol Forecast, Event Vol, Positioning, RV Scanner, Hedge Lab, Risk Desk, Margin Desk, AI Hedger, Jump Lab, Exotics Desk, TARF Desk, Cross-Asset, Vol Smile, Smile Dynamics, 3D Surfaces, Breakeven, Scenarios, Monte Carlo, Institutional, Calendar, Live Map, Live Feeds, Volume Profile, News Center.
- Stack: React 19 + Vite 8 frontend (Zustand store, Plotly charts, Leaflet map, Tailwind 4 available), FastAPI backend. Frontend deploys to Vercel; backend to a Procfile host.
- Instruments: FX pairs, BTC/ETH, XAU/XAG; some modules are crypto-only (Deribit-backed).
- Every feature, model and data path must survive any redesign.

## Brand Commitments

- Product name: **NEXUS** / Nexus Terminal. Confirmed as the only binding brand element; the logo, palette and login look may change.

## Evidence on Hand

- Real module screenshots in `screenshots/`.
- Method citations embedded in each module (Garman-Kohlhagen 1983, Castagna-Mercurio, Hagan 2002, Buehler et al. 2019, Imaki et al. 2021, Kupiec 1995, etc.).
- No customer testimonials, user counts, pricing or performance benchmarks exist; none may be invented.

## Product Principles

1. The number comes first: every screen leads with the figure a trader acts on, context second.
2. One book, every lens: the shared portfolio is the spine; modules are views onto it, never islands.
3. Show the working: methods, assumptions and data sources stay visible and citable.
4. Built for the long session: dense without strain, fast to scan, calm under volatile data.
5. Desk-grade, not toy-grade: precision and honesty over decoration.
