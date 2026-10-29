import {
  Sigma, ChartCandlestick, Zap, FlaskConical, BrainCircuit, CalendarClock, Magnet, ScanSearch,
  Scale, ShieldCheck, Landmark, Bot, Activity, Puzzle, Target, Link2, Spline, WavesHorizontal,
  Mountain, Crosshair, TriangleAlert, Dices, Building, CalendarDays, Earth, Radio, ChartColumn, Newspaper, SquareSigma,
} from 'lucide-react'

// Desk registry: one source for the rail, the desk index (Ctrl K), routing and desk headers.
// `meta` is the method line shown under each desk title.
export const DESK_GROUPS = [
  { id: 'pricing',    label: 'Pricing' },
  { id: 'vol',        label: 'Volatility' },
  { id: 'risk',       label: 'Hedging & Risk' },
  { id: 'structured', label: 'Structured' },
  { id: 'flow',       label: 'Flow & Macro' },
  { id: 'live',       label: 'Live' },
]

export const DESKS = [
  { id: 'greeks',      group: 'pricing',    label: 'Greeks',         icon: Sigma,            meta: 'Portfolio sensitivities · Garman-Kohlhagen (1983)' },
  { id: 'breakeven',   group: 'pricing',    label: 'Breakeven',      icon: Crosshair,        meta: 'Payoff at expiry, breakevens, max profit and loss' },
  { id: 'scenarios',   group: 'pricing',    label: 'Scenarios',      icon: TriangleAlert,    meta: 'Spot and vol shock grid, full revaluation' },
  { id: 'montecarlo',  group: 'pricing',    label: 'Monte Carlo',    icon: Dices,            meta: 'GBM paths, terminal P&L distribution, probability of profit' },
  { id: 'surfaces',    group: 'pricing',    label: '3D Surfaces',    icon: Mountain,         meta: 'Greek and P&L surfaces across spot × vol' },

  { id: 'vollab',      group: 'vol',        label: 'Vol Lab',        icon: FlaskConical,     meta: 'Live Deribit surface · raw-SVI per expiry · vol cone · VRP' },
  { id: 'volforecast', group: 'vol',        label: 'Vol Forecast',   icon: BrainCircuit,     meta: 'HAR-RV, GJR-GARCH, boosting · QLIKE ensemble · HMM regime' },
  { id: 'smile',       group: 'vol',        label: 'Vol Smile',      icon: Spline,           meta: 'Vanna-Volga smile from ATM / 25Δ RR / 25Δ BF · Castagna-Mercurio' },
  { id: 'smiledyn',    group: 'vol',        label: 'Smile Dynamics', icon: WavesHorizontal,  meta: 'SABR fits · sticky / Bartlett deltas · spot-vol regime' },
  { id: 'eventvol',    group: 'vol',        label: 'Event Vol',      icon: CalendarClock,    meta: 'Event and weekend vol time · forward vols · event moves' },
  { id: 'variance',    group: 'vol',        label: 'Variance Desk',  icon: SquareSigma,      meta: 'Var / vol swaps (Cboe-DVOL replication) · BKM moments · implied density · VRP' },

  { id: 'risk',        group: 'risk',       label: 'Risk Desk',      icon: ShieldCheck,      meta: 'Full-revaluation VaR / ES · stressed window · backtest · P&L explain' },
  { id: 'margin',      group: 'risk',       label: 'Margin Desk',    icon: Landmark,         meta: 'SPAN-style scan risk · portfolio margin · hike shocks · call odds' },
  { id: 'hedgelab',    group: 'risk',       label: 'Hedge Lab',      icon: Scale,            meta: 'Monte Carlo delta-hedging and gamma-scalping P&L' },
  { id: 'aihedger',    group: 'risk',       label: 'AI Hedger',      icon: Bot,              meta: 'Deep hedging · No-Transaction-Band network · CVaR objective' },

  { id: 'exotics',     group: 'structured', label: 'Exotics Desk',   icon: Puzzle,           meta: 'Barriers (BGK), touches, smile digitals, DCI, accumulators' },
  { id: 'tarf',        group: 'structured', label: 'TARF Desk',      icon: Target,           meta: 'Target redemption forwards · flat vol, SSVI-Dupire local vol, jumps' },
  { id: 'jumps',       group: 'structured', label: 'Jump Lab',       icon: Activity,         meta: 'Merton and Bates calibrated to the Deribit smile' },

  { id: 'positioning', group: 'flow',       label: 'Positioning',    icon: Magnet,           meta: 'Dealer GEX · gamma flip · walls · vanna and charm · max pain' },
  { id: 'rvscan',      group: 'flow',       label: 'RV Scanner',     icon: ScanSearch,       meta: 'Basis, funding, SVI rich / cheap net of bid-ask, parity, static arb' },
  { id: 'xasset',      group: 'flow',       label: 'Cross-Asset',    icon: Link2,            meta: 'Correlations · gold/silver ratio · Margrabe outperformance' },
  { id: 'signals',     group: 'flow',       label: 'AI Signals',     icon: Zap,              meta: 'RSI, MACD, Bollinger, Hurst, OU mean reversion, carry, regime' },
  { id: 'institutional', group: 'flow',     label: 'Institutional',  icon: Building,         meta: 'CFTC Commitment of Traders · asset managers, funds, dealers' },
  { id: 'volume',      group: 'flow',       label: 'Volume Profile', icon: ChartColumn,      meta: 'Volume at price · POC, value area high and low' },
  { id: 'calendar',    group: 'flow',       label: 'Calendar',       icon: CalendarDays,     meta: 'Forex Factory economic events · impact, forecast, countdown' },

  { id: 'chart',       group: 'live',       label: 'Chart',          icon: ChartCandlestick, meta: 'OHLCV candles with overlays' },
  { id: 'newscenter',  group: 'live',       label: 'News Center',    icon: Newspaper,        meta: 'Market news feed · breaking · signals' },
  { id: 'livefeeds',   group: 'live',       label: 'Live Feeds',     icon: Radio,            meta: 'Crypto markets and global live data' },
  { id: 'worldmap',    group: 'live',       label: 'Live Map',       icon: Earth,            meta: 'Aircraft, earthquakes, weather radar and FX events' },
]

export const DEFAULT_DESK = 'greeks'
export const deskById = (id) => DESKS.find(d => d.id === id)
export const groupLabel = (gid) => DESK_GROUPS.find(g => g.id === gid)?.label ?? ''
