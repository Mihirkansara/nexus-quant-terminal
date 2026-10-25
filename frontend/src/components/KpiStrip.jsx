// The engraved KPI strip shared by every desk: one hairline-ruled band, labels top-left,
// figures right-aligned in serial numerals on one shared baseline (CSS subgrid rows).
// Items: { label, value, sub?, hint?, color? }; color is for P&L sign or warnings only.

// Column counts that fill every row: wide = all in one row up to 6, else an even divisor;
// mid (under 1360px) = the largest divisor of n that is at most 4.
const wideCols = (n) => (n <= 6 ? n : [6, 5, 4, 3].find(c => n % c === 0) ?? Math.ceil(n / 2))
const midCols = (n) => (n <= 4 ? n : [4, 3].find(c => n % c === 0) ?? 3)

export default function KpiStrip({ items, style }) {
  const list = items.filter(Boolean)
  return (
    <div className="nx-kpis" style={{ '--cols': wideCols(list.length), '--cols-md': midCols(list.length), ...style }}>
      {list.map(k => (
        <div key={k.label} className="nx-kpi" title={k.hint}>
          <div className="nx-kpi-label">{k.label}</div>
          <div className="nx-kpi-value serial" style={k.color ? { color: k.color } : undefined}>{k.value}</div>
          <div className="nx-kpi-sub" title={typeof k.sub === 'string' ? k.sub : undefined}>{k.sub ?? ''}</div>
        </div>
      ))}
    </div>
  )
}
