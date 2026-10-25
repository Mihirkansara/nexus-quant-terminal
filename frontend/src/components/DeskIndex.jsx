import { useState, useMemo } from 'react'
import { Search, ArrowRightLeft } from 'lucide-react'
import { DESKS, DESK_GROUPS } from '../desks'
import { PAIR_META, usePortfolioStore } from '../store/portfolio'

// Whole-cell index of every desk (and instrument), opened with Ctrl K.
// Mounted only while open, so its search state starts fresh each time.
export default function DeskIndex({ onClose, onSelect, active }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const setPair = usePortfolioStore(s => s.setPair)
  const pair = usePortfolioStore(s => s.pair)

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const hit = (s) => !t || s.toLowerCase().includes(t)
    const desks = DESKS.filter(d => hit(d.label) || hit(d.meta) || hit(DESK_GROUPS.find(g => g.id === d.group).label))
      .map(d => ({ kind: 'desk', id: d.id, group: d.group, label: d.label, sub: d.meta, icon: d.icon }))
    const pairs = Object.keys(PAIR_META).filter(p => t && hit(p))
      .map(p => ({ kind: 'pair', id: p, group: 'pairs', label: p, sub: p === pair ? 'Current instrument' : 'Switch the book to this instrument', icon: ArrowRightLeft }))
    return [...desks, ...pairs]
  }, [q, pair])

  const cur = Math.min(cursor, Math.max(0, items.length - 1))

  const choose = (it) => {
    if (!it) return
    if (it.kind === 'desk') onSelect(it.id)
    else setPair(it.id)
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setCursor(Math.min(items.length - 1, cur + 1)) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setCursor(Math.max(0, cur - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[cur]) }
  }

  const groups = [...DESK_GROUPS, { id: 'pairs', label: 'Instruments' }]
  let idx = -1

  return (
    <div className="nx-index-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="nx-index" role="dialog" aria-modal="true" aria-label="Desk index" onKeyDown={onKey}>
        <div className="nx-index-search">
          <Search size={17} color="var(--text-muted)" aria-hidden="true" />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setCursor(0) }}
            placeholder="Search 28 desks, models or instruments" aria-label="Search desks"
            role="combobox" aria-expanded="true" aria-controls="nx-index-list" />
          <span className="nx-kbd">Esc</span>
        </div>
        <div className="nx-index-grid" id="nx-index-list" role="listbox">
          {items.length === 0 && <div className="nx-index-empty">No desk matches “{q}”. Try a model name such as SABR, VaR or GEX.</div>}
          {groups.map(g => {
            const inGroup = items.filter(it => it.group === g.id)
            if (!inGroup.length) return null
            return [
              <div className="nx-index-group" key={'g' + g.id}>{g.label}</div>,
              ...inGroup.map(it => {
                idx += 1
                const my = idx
                const Icon = it.icon
                return (
                  <button key={it.kind + it.id} className="nx-index-cell" role="option"
                    aria-selected={my === cur} data-active={my === cur ? 'true' : 'false'}
                    onMouseEnter={() => setCursor(my)} onClick={() => choose(it)}>
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                    <div style={{ minWidth: 0 }}>
                      <b>{it.label}{it.kind === 'desk' && it.id === active ? <span style={{ display: 'inline', marginLeft: 6, color: 'var(--uv)', fontSize: 11 }}>open</span> : null}</b>
                      <span>{it.sub}</span>
                    </div>
                  </button>
                )
              }),
            ]
          })}
        </div>
        <div className="nx-index-foot">
          <span><span className="nx-kbd">↑↓</span> move</span>
          <span><span className="nx-kbd">Enter</span> open</span>
          <span style={{ marginLeft: 'auto' }}>Type a pair such as XAUUSD to switch the book</span>
        </div>
      </div>
    </div>
  )
}
