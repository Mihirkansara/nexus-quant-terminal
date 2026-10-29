import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
const api = axios.create({ baseURL: BASE })

// Market
export const fetchMarket     = (ticker)         => api.get(`/market/${ticker}`).then(r=>r.data)
export const fetchIVSurface  = (ticker)         => api.get(`/market/iv-surface/${ticker}`).then(r=>r.data)

// Forex
export const fetchForexRates = ()               => api.get('/forex/rates').then(r=>r.data)
export const fetchForexRate  = (pair)           => api.get(`/forex/rate/${pair}`).then(r=>r.data)
export const fetchOHLC       = (pair,iv,period) => api.get(`/forex/ohlc/${pair}`,{params:{interval:iv,period}}).then(r=>r.data)
export const fetchSignals    = (pair)           => api.get(`/forex/signals/${pair}`).then(r=>r.data)
export const fetchPairs      = ()               => api.get('/forex/pairs').then(r=>r.data)

// Options analytics
export const fetchStrategies = ()               => api.get('/strategies').then(r=>r.data)
export const computeGreeks   = (p)             => api.post('/greeks', p).then(r=>r.data)
export const computeSurface  = (p)             => api.post('/surface', p).then(r=>r.data)
export const computeMonteCarlo = (p)           => api.post('/montecarlo', p).then(r=>r.data)
export const computeScenarios  = (p)           => api.post('/scenarios', p).then(r=>r.data)
export const computeSmile      = (p)           => api.post('/smile', p).then(r=>r.data)

// Vol Lab
export const fetchVolCone   = (pair)     => api.get(`/vol/cone/${pair}`).then(r=>r.data)
export const fetchCryptoVol = (currency) => api.get(`/vol/crypto/${currency}`).then(r=>r.data)
export const fetchVolForecast = (pair)   => api.get(`/vol/forecast/${pair}`).then(r=>r.data)

// Hedge Lab
export const simulateHedge = (p) => api.post('/hedge/simulate', p).then(r=>r.data)

// Cross-asset desk
export const fetchCrossAsset = () => api.get('/xasset').then(r=>r.data)
export const priceMargrabe   = (p) => api.post('/xasset/margrabe', p).then(r=>r.data)

// Jump Lab
export const calibrateJumps = (ccy) => api.get(`/jumps/calibrate/${ccy}`).then(r=>r.data)
export const priceMerton    = (p)   => api.post('/jumps/merton', p).then(r=>r.data)
export const exportCSV         = (p)           => api.post('/export/csv', p, {responseType:'blob'}).then(r=>r.data)

// Institutional flow
export const fetchInstitutional = (pair, weeks) =>
  api.get(`/institutional/${pair}`, { params: { weeks } }).then(r => r.data)

// Economic calendar (Forex Factory)
export const fetchCalendar = () =>
  api.get('/news/calendar').then(r => r.data)

// Exotics Desk
export const priceBarriers    = (p) => api.post('/exotics/barrier', p).then(r=>r.data)
export const priceDci         = (p) => api.post('/exotics/dci', p).then(r=>r.data)
export const priceAccumulator = (p) => api.post('/exotics/accumulator', p).then(r=>r.data)

// Event & Weekend Vol
export const fetchEventVolCrypto   = (ccy)  => api.get(`/eventvol/crypto/${ccy}`).then(r=>r.data)
export const fetchEventVolRealised = (pair) => api.get(`/eventvol/realised/${pair}`).then(r=>r.data)
export const priceEventVol         = (p)    => api.post('/eventvol/model', p).then(r=>r.data)

// Risk Desk
export const fetchBookRisk = (p) => api.post('/risk/book', p).then(r=>r.data)
export const explainPnl    = (p) => api.post('/risk/explain', p).then(r=>r.data)

// TARF Desk
export const priceTarf = (p) => api.post('/tarf/price', p).then(r=>r.data)

// AI Hedger (deep hedging)
export const trainDeepHedge = (p) => api.post('/deephedge/train', p, { timeout: 120000 }).then(r=>r.data)

// Positioning Desk (Deribit OI)
export const fetchPositioning = (ccy, convention = 'classic', maxDays = 120) =>
  api.get(`/positioning/${ccy}`, { params: { convention, max_days: maxDays } }).then(r=>r.data)

// Smile Dynamics (SABR / Bartlett)
export const fetchSmileDynCrypto = ({ ccy, beta }) => api.get(`/smiledyn/crypto/${ccy}`, { params: { beta } }).then(r=>r.data)
export const fetchSmileDynQuotes = (p) => api.post('/smiledyn/quotes', p).then(r=>r.data)

// Variance Desk (var / vol swaps, implied moments and density, VRP)
export const fetchVarianceCrypto = ({ ccy }) => api.get(`/variance/crypto/${ccy}`, { timeout: 60000 }).then(r=>r.data)
export const fetchVarianceSmile  = (p) => api.post('/variance/smile', p, { timeout: 60000 }).then(r=>r.data)

// Margin Desk
export const fetchMarginBook = (p) => api.post('/margin/book', p, { timeout: 60000 }).then(r=>r.data)

// Carry & RV Scanner
export const fetchRvScan = (ccy) => api.get(`/rvscan/${ccy}`).then(r=>r.data)

// Volume profile
export const fetchVolumePairs   = ()              => api.get('/volume/pairs').then(r => r.data)
export const fetchVolumeProfile = (pair, profile) =>
  api.get(`/volume/profile/${pair}`, { params: { profile } }).then(r => r.data)

// News center
export const fetchNewsFeed     = (limit, offset) =>
  api.get('/newscenter/feed', { params: { limit, offset } }).then(r => r.data)
export const fetchHotStory     = () => api.get('/newscenter/hot').then(r => r.data)
export const fetchNewsSignals  = () => api.get('/newscenter/signals').then(r => r.data)
export const fetchBreakingNews = () => api.get('/newscenter/breaking').then(r => r.data)
