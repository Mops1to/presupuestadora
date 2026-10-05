export function MaterialGrid({ materials, selected, onSelect, label }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wide text-ink mb-1.5">{label}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {(materials || []).map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`text-left border rounded-md px-2 py-1.5 text-[11px] transition-colors
              ${selected === m.id ? 'border-ink bg-ink-soft' : 'border-border hover:border-ink-light'}`}
          >
            <div className="font-medium text-text">{m.name}{m.requiere_camara ? ' 🔥' : ''}</div>
            <div className="font-mono text-[10px] text-text3 mt-0.5">{m.price}€/kg</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrinterTabs({ printers, selected, onSelect }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {(printers || []).map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`border rounded-md px-2.5 py-1.5 text-[11px] transition-colors
            ${selected === p.id ? 'border-ink bg-ink-soft text-ink font-semibold' : 'border-border text-text2 hover:border-ink-light'}`}
        >
          <div>{p.name}</div>
          <div className="font-mono text-[10px] text-text3">{p.watts}W</div>
        </button>
      ))}
    </div>
  );
}
