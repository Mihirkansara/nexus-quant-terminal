import { DESKS, DESK_GROUPS } from '../desks'

export default function DeskRail({ active, onSelect }) {
  return (
    <nav className="nx-rail" aria-label="Desks">
      {DESK_GROUPS.map(g => (
        <div className="nx-rail-group" key={g.id}>
          <div className="nx-rail-label"><span>{g.label}</span></div>
          {DESKS.filter(d => d.group === g.id).map(d => {
            const Icon = d.icon
            return (
              <button key={d.id} className="nx-rail-item" onClick={() => onSelect(d.id)}
                aria-current={active === d.id ? 'page' : undefined} title={d.label}>
                <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                <span className="nx-rail-name">{d.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
