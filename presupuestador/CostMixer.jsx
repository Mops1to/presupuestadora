import { Lock, Unlock } from 'lucide-react';

function LockBtn({ locked, onClick }) {
  return (
    <button onClick={onClick} title="Bloquear/desbloquear esta barra"
      className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border text-[9px] mr-1.5
        ${locked ? 'border-amber-500 bg-amber-100 text-amber-700' : 'border-border text-text3'}`}>
      {locked ? <Lock size={10} /> : <Unlock size={10} />}
    </button>
  );
}

function Bar({ label, locked, onLock, value, hint, pct, showBar }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[12px] mb-1">
        <span className="flex items-center text-text2">
          <LockBtn locked={locked} onClick={onLock} />
          {label}
        </span>
        <span className="font-mono text-text">{value}</span>
      </div>
      {showBar && (
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-ink transition-all" style={{ width: pct + '%' }} />
        </div>
      )}
      {hint}
    </div>
  );
}

export default function CostMixer({ calculator }) {
  const {
    mat1, mat2, printer, machRate, usaCamaraCaliente, calc,
    machH, setMachH, laborH, setLaborH, disenoH, setDisenoH,
    disenoOn, setDisenoOn, locks, toggleLock,
    targetPrice, setTargetPrice, targetBreakdown, applyTargetPrice, sobrePrecio,
    DISENO_RATE_DEFAULT,
  } = calculator;

  const pct = (v) => (calc.total > 0 ? Math.min(100, (v / calc.total) * 100) : 0);
  const sliderClass = 'w-full accent-ink';

  return (
    <div className={`bg-bg-app border rounded-lg p-3.5 ${sobrePrecio ? 'border-red-400' : 'border-border'}`}>
      <div className="flex justify-between items-center mb-3">
        <span className="text-[12.5px] font-semibold text-ink">⚖️ Desglose de costes</span>
        <span className="text-[11px] text-text3">
          Precio objetivo: <span className="font-mono">{targetPrice ? `${parseFloat(targetPrice).toFixed(2)} €` : 'sin fijar'}</span>
        </span>
      </div>

      <Bar label={`Material principal (${calc.g1Num.toFixed(1)}g · ${mat1?.price ?? '—'}€/kg)`}
        locked={locks.mat1} onLock={() => toggleLock('mat1')}
        value={`${calc.matCost1.toFixed(2)} €`} pct={pct(calc.matCost1)} showBar />

      <Bar label={`Soporte (${calc.g2Num.toFixed(1)}g · ${mat2?.price ?? '—'}€/kg)`}
        locked={locks.mat2} onLock={() => toggleLock('mat2')}
        value={`${calc.matCost2.toFixed(2)} €`} pct={pct(calc.matCost2)} showBar />

      <Bar label={`Máquina — ${printer?.name || '—'}${usaCamaraCaliente ? ' 🔥 cámara' : ''} (${machRate.toFixed(2)}€/h)`}
        locked={locks.mach} onLock={() => toggleLock('mach')}
        value={`${calc.machCost.toFixed(2)} €`}
        hint={<input type="range" min="0" max={Math.max(calc.machHNum * 3, 50)} step="0.1" value={machH}
          onChange={e => setMachH(e.target.value)} className={sliderClass} />} />

      {calc.estCost > 0 && (
        <Bar label="⚙️ Estructura taller (mismas horas que máquina)" locked={false} onLock={() => {}}
          value={`${calc.estCost.toFixed(2)} €`} showBar={false} />
      )}

      <Bar label="Mano de obra (15€/h)" locked={locks.labor} onLock={() => toggleLock('labor')}
        value={`${calc.laborCost.toFixed(2)} €`}
        hint={<input type="range" min="0" max={Math.max(calc.laborHNum * 3, 50)} step="0.1" value={laborH}
          onChange={e => setLaborH(e.target.value)} className={sliderClass} />} />

      <div className="mb-2.5">
        <div className="flex justify-between text-[12px] mb-1">
          <label className="flex items-center gap-1.5 text-text2 cursor-pointer">
            <LockBtn locked={locks.diseno} onClick={() => toggleLock('diseno')} />
            <input type="checkbox" checked={disenoOn} onChange={e => setDisenoOn(e.target.checked)} className="accent-ink" />
            {`Diseño (${DISENO_RATE_DEFAULT}€/h)`}
          </label>
          <span className="font-mono text-text">{calc.disenoCost.toFixed(2)} €</span>
        </div>
        <input type="range" min="0" max="50" step="0.1" value={disenoH} disabled={!disenoOn}
          onChange={e => setDisenoH(e.target.value)} className={sliderClass + (disenoOn ? '' : ' opacity-30')} />
      </div>

      <div className="pt-2 mt-1 border-t border-border flex justify-between items-center">
        <span className="text-[12px] text-text3">Total sin IVA</span>
        <span className={`font-mono font-bold text-base ${sobrePrecio ? 'text-red-500' : 'text-ink'}`}>{calc.total.toFixed(2)} €</span>
      </div>

      <div className="flex gap-2 mt-3">
        <input type="number" step="0.01" min="0" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
          placeholder="Precio objetivo (ej: 148.76)" className="flex-1 text-[12px] border border-border rounded-md px-2.5 py-1.5" />
        <button onClick={applyTargetPrice} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-white whitespace-nowrap">
          🔒 Repartir
        </button>
      </div>
      {targetBreakdown && <div className="text-[11px] text-text3 mt-2">{targetBreakdown}</div>}
    </div>
  );
}
