import { useState, useEffect } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore } from '../store/portfolio'
import { fetchInstitutional } from '../api/client'

const C = {
  am:     '#00ff88',   // asset managers — real money — green
  lm:     '#a78bfa',   // leveraged money (hedge funds) — purple
  dealer: '#ff3d5a',   // dealers — red
  oi:     '#00d4ff',   // open interest — cyan
  poc:    '#ffd700',   // POC — gold
  vah:    'rgba(0,212,255,0.6)',
  val:    'rgba(0,212,255,0.6)',
  now:    '#00ff88',
}

const BIAS_BG = { BULLISH:'rgba(0,255,136,0.1)', BEARISH:'rgba(255,61,90,0.1)', NEUTRAL:'rgba(255,215,0,0.1)' }
const BIAS_C  = { BULLISH:'#00ff88',              BEARISH:'#ff3d5a',              NEUTRAL:'#ffd700' }
const BIAS_BD = { BULLISH:'rgba(0,255,136,0.3)',   BEARISH:'rgba(255,61,90,0.3)',   NEUTRAL:'rgba(255,215,0,0.3)' }

const Badge = ({ v }) => (
  <span style={{ padding:'2px 9px', borderRadius:20, fontSize:9, fontWeight:700,
    background: BIAS_BG[v]||'rgba(148,163,184,0.1)',
    color: BIAS_C[v]||'#94a3b8',
    border:`1px solid ${BIAS_BD[v]||'rgba(148,163,184,0.2)'}`,
    textTransform:'uppercase', letterSpacing:'0.07em' }}>{v}</span>
)

const StatCard = ({ label, value, sub, color='var(--cyan)', border }) => (
  <div className="glass" style={{ padding:'10px 14px', borderRadius:8, flex:1,
    borderLeft: border ? `3px solid ${border}` : undefined }}>
    <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase',
      letterSpacing:'0.08em', marginBottom:3 }}>{label}</div>
    <div className="font-mono" style={{ fontSize:17, fontWeight:700, color }}>{value}</div>
    {sub && <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
  </div>
)

const bgLayout = {
  paper_bgcolor:'transparent', plot_bgcolor:'rgba(4,10,28,0.7)',
  font:{ color:'#475569', family:'JetBrains Mono, monospace', size:9 },
  margin:{ l:56, r:12, t:20, b:40 },
  xaxis:{ gridcolor:'rgba(0,212,255,0.05)', color:'#475569', zeroline:false, tickangle:-30 },
  yaxis:{ gridcolor:'rgba(0,212,255,0.05)', color:'#475569', zeroline:false },
  hovermode:'x unified',
  hoverlabel:{ bgcolor:'rgba(4,10,28,0.95)', bordercolor:'rgba(0,212,255,0.3)',
    font:{ color:'#e0f2fe', family:'JetBrains Mono', size:10 } },
  legend:{ bgcolor:'transparent', font:{ size:9, color:'#64748b' },
    orientation:'h', x:0, y:1.04 },
}

export default function InstitutionalFlow() {
  const { pair } = usePortfolioStore()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [weeks, setWeeks]     = useState(26)

  const load = async () => {
    setLoading(true); setError(null)
    try { setData(await fetchInstitutional(pair, weeks)) }
    catch (e) { setError(e?.response?.data?.detail || 'Data unavailable.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [pair, weeks])

  if (loading) return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div className="live-dot"/>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          Fetching CFTC TFF data + computing volume profile…
        </span>
      </div>
      {[...Array(6)].map((_,i) => (
        <div key={i} className="skeleton" style={{ height:50, marginBottom:6, borderRadius:6 }}/>
      ))}
    </div>
  )

  if (error) return (
    <div style={{ padding:16 }}>
      <div style={{ padding:12, borderRadius:6, background:'rgba(255,61,90,0.1)',
        border:'1px solid #ff3d5a', color:'#ff3d5a', fontSize:12, marginBottom:10 }}>{error}</div>
      <button className="btn-primary" onClick={load}>Retry</button>
    </div>
  )
  if (!data) return null

  const { cot: c, volume_profile: vp } = data

  // ── Build Plotly traces ─────────────────────────────────

  // 1. Asset Manager net bars
  const amColors = (c.am_net||[]).map(v => v >= 0 ? 'rgba(0,255,136,0.75)' : 'rgba(255,61,90,0.55)')
  const amBar = {
    type:'bar', name:'Asset Mgr Net',
    x:c.dates, y:c.am_net,
    marker:{ color:amColors, line:{ width:0 } },
    hovertemplate:'<b>%{x}</b><br>AM Net: <b>%{y:,}</b><extra></extra>',
  }

  // 2. Leveraged money net line
  const lmLine = {
    type:'scatter', mode:'lines+markers', name:'Hedge Fund Net',
    x:c.dates, y:c.lm_net,
    line:{ color:C.lm, width:2 },
    marker:{ size:4, color:C.lm },
    hovertemplate:'HF Net: %{y:,}<extra></extra>',
  }

  // 3. Dealer net line
  const dealerLine = {
    type:'scatter', mode:'lines', name:'Dealer Net',
    x:c.dates, y:c.dealer_net,
    line:{ color:C.dealer, width:1.5, dash:'dot' },
    hovertemplate:'Dealer Net: %{y:,}<extra></extra>',
  }

  // 4. Open interest
  const oiTrace = {
    type:'scatter', mode:'lines+markers', name:'Open Interest',
    x:c.dates, y:c.open_interest,
    line:{ color:C.oi, width:2 },
    marker:{ size:4, color:C.oi },
    fill:'tozeroy', fillcolor:'rgba(0,212,255,0.05)',
    hovertemplate:'OI: %{y:,.0f}<extra></extra>',
  }

  // 5. COT Index lines (rolling percentile)
  const amIdx  = (c.am_net||[]).map((_, i, a) => {
    const sl = a.slice(0, i + 1), lo = Math.min(...sl), hi = Math.max(...sl)
    return hi > lo ? Math.round((a[i] - lo) / (hi - lo) * 100) : 50
  })
  const lmIdx  = (c.lm_net||[]).map((_, i, a) => {
    const sl = a.slice(0, i + 1), lo = Math.min(...sl), hi = Math.max(...sl)
    return hi > lo ? Math.round((a[i] - lo) / (hi - lo) * 100) : 50
  })
  const amIdxTrace = {
    type:'scatter', mode:'lines', name:'AM Index',
    x:c.dates, y:amIdx,
    line:{ color:C.am, width:2 },
    hovertemplate:'AM Index: %{y}<extra></extra>',
  }
  const lmIdxTrace = {
    type:'scatter', mode:'lines', name:'HF Index',
    x:c.dates, y:lmIdx,
    line:{ color:C.lm, width:1.5, dash:'dot' },
    hovertemplate:'HF Index: %{y}<extra></extra>',
  }

  // 6. Long/short stacked bars
  const amLongBar  = { type:'bar', name:'AM Long',  x:c.dates, y:c.am_long,
    marker:{ color:'rgba(0,255,136,0.65)' },
    hovertemplate:'AM Long: %{y:,}<extra></extra>' }
  const amShortBar = { type:'bar', name:'AM Short', x:c.dates, y:c.am_short.map(v => -v),
    marker:{ color:'rgba(255,61,90,0.55)' },
    hovertemplate:'AM Short: %{y:,}<extra></extra>' }
  const lmLongBar  = { type:'bar', name:'HF Long',  x:c.dates, y:c.lm_long,
    marker:{ color:'rgba(167,139,250,0.6)' },
    hovertemplate:'HF Long: %{y:,}<extra></extra>' }
  const lmShortBar = { type:'bar', name:'HF Short', x:c.dates, y:c.lm_short.map(v => -v),
    marker:{ color:'rgba(167,139,250,0.35)' },
    hovertemplate:'HF Short: %{y:,}<extra></extra>' }

  // 7. Volume Profile
  const vpColors = (vp.volumes||[]).map((_, i) => {
    const p = (vp.prices||[])[i]
    if (!p) return 'rgba(0,212,255,0.22)'
    const bktSize = (vp.global_hi - vp.global_lo) / (vp.prices?.length || 40)
    if (Math.abs(p - vp.poc) < bktSize * 0.6)        return 'rgba(255,215,0,0.9)'
    if (p >= vp.val && p <= vp.vah)                   return 'rgba(0,212,255,0.55)'
    return 'rgba(0,212,255,0.22)'
  })
  const vpTrace = {
    type:'bar', orientation:'h',
    x:vp.volumes, y:vp.prices,
    name:'Volume',
    marker:{ color:vpColors, line:{ width:0 } },
    hovertemplate:'Price: %{y:.5f}<br>Vol: %{x:,.0f}<extra></extra>',
  }

  const vpShapes = [
    { type:'line', x0:0, x1:1, xref:'paper', y0:vp.current_price, y1:vp.current_price,
      line:{ color:'#00ff88', width:1.5, dash:'dash' } },
    { type:'line', x0:0, x1:1, xref:'paper', y0:vp.poc, y1:vp.poc,
      line:{ color:'#ffd700', width:1.5, dash:'solid' } },
    { type:'line', x0:0, x1:1, xref:'paper', y0:vp.vah, y1:vp.vah,
      line:{ color:'rgba(0,212,255,0.5)', width:1, dash:'dash' } },
    { type:'line', x0:0, x1:1, xref:'paper', y0:vp.val, y1:vp.val,
      line:{ color:'rgba(0,212,255,0.5)', width:1, dash:'dash' } },
  ].filter(s => s.line && s.y0)

  const indexShapes = [
    { type:'rect', x0:0, x1:1, xref:'paper', y0:65, y1:100,
      fillcolor:'rgba(0,255,136,0.04)', line:{ width:0 } },
    { type:'rect', x0:0, x1:1, xref:'paper', y0:0, y1:35,
      fillcolor:'rgba(255,61,90,0.04)', line:{ width:0 } },
    { type:'line', x0:0, x1:1, xref:'paper', y0:65, y1:65,
      line:{ color:'rgba(0,255,136,0.3)', width:1, dash:'dot' } },
    { type:'line', x0:0, x1:1, xref:'paper', y0:35, y1:35,
      line:{ color:'rgba(255,61,90,0.3)', width:1, dash:'dot' } },
  ]

  const fmtNum = n => n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString()

  return (
    <div style={{ padding:16 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="section-title">Institutional Flow — {pair}</span>
          <Badge v={c.composite_bias}/>
          <span style={{ fontSize:9, color:'var(--text-muted)' }}>
            {c.weeks}W · CFTC TFF · {c.latest_date}
          </span>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center',
          background:'rgba(0,0,0,0.2)', borderRadius:8, padding:3,
          border:'1px solid rgba(0,212,255,0.08)' }}>
          {[13, 26, 52].map(w => (
            <button key={w} onClick={() => setWeeks(w)} style={{
              padding:'4px 11px', fontSize:10, borderRadius:6, border:'none',
              cursor:'pointer', fontFamily:'JetBrains Mono',
              background: weeks===w ? 'rgba(0,212,255,0.14)' : 'transparent',
              color: weeks===w ? '#00d4ff' : '#475569',
              boxShadow: weeks===w ? '0 0 8px rgba(0,212,255,0.2)' : 'none',
              transition:'all 0.2s',
            }}>{w}W</button>
          ))}
          <button className="btn-ghost" onClick={load} style={{ fontSize:10, marginLeft:2 }}>↻</button>
        </div>
      </div>

      {/* ── Composite Index gauge ───────────────────────── */}
      <div className="glass" style={{ padding:'12px 16px', borderRadius:8, marginBottom:12,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderLeft:`3px solid ${BIAS_C[c.composite_bias]||'#94a3b8'}` }}>
        <div>
          <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase',
            letterSpacing:'0.08em', marginBottom:4 }}>Composite Institutional Index</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span className="font-mono" style={{ fontSize:28, fontWeight:800,
              color: BIAS_C[c.composite_bias]||'#94a3b8',
              textShadow:`0 0 18px ${BIAS_C[c.composite_bias]||'#94a3b8'}66` }}>
              {c.composite_index}
            </span>
            <div>
              <Badge v={c.composite_bias}/>
              <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:3 }}>
                0 = max institutional short · 100 = max institutional long
              </div>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width:220 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:8,
            color:'var(--text-muted)', marginBottom:4 }}>
            <span>BEAR</span><span>NEUTRAL</span><span>BULL</span>
          </div>
          <div style={{ height:10, background:'rgba(255,255,255,0.05)',
            borderRadius:5, border:'1px solid rgba(255,255,255,0.08)', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', borderRadius:5,
              width:`${c.composite_index}%`,
              background:`linear-gradient(90deg, #ff3d5a, #ffd700 50%, #00ff88)`,
              transition:'width 0.5s ease' }}/>
            <div style={{ position:'absolute', top:-2, left:`${c.composite_index}%`,
              transform:'translateX(-50%)',
              width:14, height:14, borderRadius:'50%',
              background: BIAS_C[c.composite_bias]||'#94a3b8',
              border:'2px solid rgba(4,10,28,0.8)',
              boxShadow:`0 0 8px ${BIAS_C[c.composite_bias]||'#94a3b8'}` }}/>
          </div>
        </div>
      </div>

      {/* ── Trader category cards ──────────────────────── */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <StatCard label="Asset Managers" border={C.am}
          value={fmtNum(c.am_current_net)}
          sub={`Index: ${c.am_index} · ${c.am_bias} · Δ${fmtNum(c.am_wk_change)} wk`}
          color={c.am_current_net >= 0 ? C.am : '#ff3d5a'} />
        <StatCard label="Hedge Funds (Lev. Money)" border={C.lm}
          value={fmtNum(c.lm_current_net)}
          sub={`Index: ${c.lm_index} · ${c.lm_bias} · Δ${fmtNum(c.lm_wk_change)} wk`}
          color={c.lm_current_net >= 0 ? C.am : '#ff3d5a'} />
        <StatCard label="Open Interest" border={C.oi}
          value={(c.open_interest?.at(-1)||0).toLocaleString()}
          sub="Total outstanding futures contracts"
          color={C.oi} />
        {vp.poc && (
          <StatCard label="Vol. Profile POC" border={C.poc}
            value={vp.poc?.toFixed(5)}
            sub={`VAH: ${vp.vah?.toFixed(5)} · VAL: ${vp.val?.toFixed(5)}`}
            color={C.poc} />
        )}
      </div>

      {/* ── Charts ─────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:10 }}>

        {/* Left column */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

          {/* Asset Manager + Hedge Fund net positioning */}
          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            <div style={{ paddingLeft:4, marginBottom:4 }}>
              <span style={{ fontSize:9, color:C.am, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.1em' }}>
                Asset Manager & Hedge Fund Net Positioning
              </span>
              <span style={{ fontSize:8, color:'var(--text-muted)', marginLeft:8 }}>
                Bars = Asset Mgr · Line = Hedge Funds
              </span>
            </div>
            <Plot data={[amBar, lmLine, dealerLine]}
              layout={{ ...bgLayout, margin:{...bgLayout.margin, t:8},
                barmode:'overlay',
                shapes:[{ type:'line', x0:0, x1:1, xref:'paper', y0:0, y1:0,
                  line:{ color:'rgba(255,255,255,0.12)', width:1 } }] }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:210 }} />
          </div>

          {/* COT Index (rolling percentile) */}
          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            <div style={{ paddingLeft:4, marginBottom:4 }}>
              <span style={{ fontSize:9, color:C.oi, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.1em' }}>
                Institutional Positioning Index (0–100 Percentile)
              </span>
            </div>
            <Plot data={[amIdxTrace, lmIdxTrace]}
              layout={{ ...bgLayout, margin:{...bgLayout.margin, t:8},
                yaxis:{ ...bgLayout.yaxis, range:[0,100],
                  tickvals:[0,35,50,65,100],
                  ticktext:['0','Bear','50','Bull','100'] },
                shapes:indexShapes }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:175 }} />
          </div>

          {/* Long/short breakdown stacked */}
          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            <div style={{ paddingLeft:4, marginBottom:4 }}>
              <span style={{ fontSize:9, color:'var(--text-dim)', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.1em' }}>
                Long / Short Breakdown (above = long, below = short)
              </span>
            </div>
            <Plot data={[amLongBar, amShortBar, lmLongBar, lmShortBar]}
              layout={{ ...bgLayout, margin:{...bgLayout.margin, t:8},
                barmode:'group',
                shapes:[{ type:'line', x0:0, x1:1, xref:'paper', y0:0, y1:0,
                  line:{ color:'rgba(255,255,255,0.12)', width:1 } }] }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:175 }} />
          </div>

          {/* Open interest */}
          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            <div style={{ paddingLeft:4, marginBottom:4 }}>
              <span style={{ fontSize:9, color:C.oi, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.1em' }}>
                Open Interest
              </span>
            </div>
            <Plot data={[oiTrace]}
              layout={{ ...bgLayout, margin:{...bgLayout.margin, t:8} }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:140 }} />
          </div>
        </div>

        {/* Right: Volume Profile */}
        {vp.prices && (
          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            <div style={{ fontSize:9, color:C.poc, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8, paddingLeft:4 }}>
              Volume Profile — 3 Months
            </div>

            {/* Legend */}
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10, paddingLeft:4 }}>
              {[
                { color:C.poc,  label:`POC  ${vp.poc?.toFixed(5)}`,          dash:false },
                { color:'rgba(0,212,255,0.7)', label:`VAH ${vp.vah?.toFixed(5)}`, dash:true },
                { color:'rgba(0,212,255,0.7)', label:`VAL ${vp.val?.toFixed(5)}`, dash:true },
                { color:C.now,  label:`Now  ${vp.current_price?.toFixed(5)}`, dash:true },
              ].map(({ color, label, dash }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:20, height:1.5, background:color, borderRadius:1,
                    borderTop: dash ? `1.5px dashed ${color}` : undefined,
                    background: dash ? 'none' : color }}/>
                  <span className="font-mono" style={{ fontSize:9, color }}>{label}</span>
                </div>
              ))}
              <div style={{ marginTop:4, fontSize:8, color:'var(--text-muted)', lineHeight:1.4 }}>
                <span style={{ color:'rgba(0,212,255,0.55)' }}>■</span> Value Area (70% vol)<br/>
                <span style={{ color:C.poc }}>■</span> POC — max volume
              </div>
            </div>

            <Plot data={[vpTrace]}
              layout={{
                paper_bgcolor:'transparent', plot_bgcolor:'rgba(4,10,28,0.7)',
                font:{ color:'#475569', family:'JetBrains Mono', size:8 },
                margin:{ l:58, r:10, t:8, b:28 },
                xaxis:{ gridcolor:'rgba(0,212,255,0.04)', color:'#475569', zeroline:false,
                  title:{ text:'Volume', font:{ size:8 } } },
                yaxis:{ gridcolor:'rgba(0,212,255,0.04)', color:'#475569', zeroline:false,
                  tickformat:'.4f', tickfont:{ size:7.5 } },
                shapes:vpShapes,
                showlegend:false,
                hovermode:'y unified',
              }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:620 }} />
          </div>
        )}
      </div>

      {/* ── Attribution ─────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
        {(data.data_sources||[]).map(src => (
          <div key={src} style={{ padding:'4px 10px', borderRadius:6, fontSize:9,
            background:'rgba(0,212,255,0.04)', border:'1px solid rgba(0,212,255,0.1)',
            color:'var(--text-muted)' }}>
            📡 {src}
          </div>
        ))}
      </div>
    </div>
  )
}
