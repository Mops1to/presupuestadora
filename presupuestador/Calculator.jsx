import { useRef } from 'react';
import { MaterialGrid, PrinterTabs } from './MaterialPrinterPicker';
import CostMixer from './CostMixer';

export default function Calculator({ calculator, onAddLine, addingLine }) {
  const {
    config, selectedMat1, setSelectedMat1, selectedMat2, setSelectedMat2, selectedPrinter, setSelectedPrinter,
    g1, setG1, g2, setG2, resetGrams,
    qty, setQty, ivaRate, setIvaRate, infill, setInfill,
    lastAnalysis, analyzing, analyzeStatus, analyzeFile,
    calc, descripcionLinea,
  } = calculator;

  const fileRef = useRef(null);

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <MaterialGrid materials={config?.materials} selected={selectedMat1} onSelect={setSelectedMat1} label="Material principal" />
        <MaterialGrid materials={config?.materials} selected={selectedMat2} onSelect={setSelectedMat2} label="Material secundario" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wide text-ink mb-1.5">Archivo 3D (opcional)</div>
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg px-4 py-4 text-center cursor-pointer hover:border-ink-light hover:bg-ink-soft transition-colors">
            <input ref={fileRef} type="file" accept=".stl,.3mf,.obj,.step,.stp" className="hidden"
              onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
            <div className="text-ink text-lg mb-1">⬆</div>
            <div className="text-[12px] text-text2">{fileRef.current?.files?.[0]?.name || 'STL/STEP/3MF/OBJ (o calcula a mano abajo)'}</div>
          </div>
          {analyzeStatus && <div className={`text-[11px] mt-1.5 ${analyzing ? 'text-text3' : 'text-ink'}`}>{analyzeStatus}</div>}
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-wide text-ink mb-1.5">Impresora</div>
          <PrinterTabs printers={config?.printers} selected={selectedPrinter} onSelect={setSelectedPrinter} />
          <label className="text-[11px] text-text3 mt-2.5 block">Relleno ({infill}%)</label>
          <input type="range" min="5" max="100" step="5" value={infill} onChange={e => setInfill(e.target.value)} className="w-full accent-ink" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[11px] text-text3">Gramos material principal</label>
          <input type="number" step="0.1" min="0" value={g1} onChange={e => setG1(e.target.value)} placeholder="auto"
            className="w-full text-[12.5px] border border-border rounded-md px-2 py-1.5 mt-0.5" />
        </div>
        <div>
          <label className="text-[11px] text-text3">Gramos soporte</label>
          <input type="number" step="0.1" min="0" value={g2} onChange={e => setG2(e.target.value)} placeholder="0"
            className="w-full text-[12.5px] border border-border rounded-md px-2 py-1.5 mt-0.5" />
        </div>
        <div>
          <label className="text-[11px] text-text3">Cantidad de piezas</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full text-[12.5px] border border-border rounded-md px-2 py-1.5 mt-0.5" />
        </div>
        <div>
          <label className="text-[11px] text-text3">IVA</label>
          <select value={ivaRate} onChange={e => setIvaRate(e.target.value)}
            className="w-full text-[12.5px] border border-border rounded-md px-2 py-1.5 mt-0.5 bg-white">
            <option value="0">Sin IVA</option><option value="4">4%</option><option value="10">10%</option><option value="21">21%</option>
          </select>
        </div>
      </div>
      <button onClick={resetGrams} className="text-[11px] text-text3 hover:text-ink mb-4">↺ Restablecer gramos al análisis</button>

      {lastAnalysis && (
        <div className="grid grid-cols-4 gap-3 mb-4 bg-bg-app rounded-lg p-3">
          <div><div className="text-[10px] text-text3">Peso</div><div className="font-mono text-[13px]">{lastAnalysis.geometry.weight_g} g</div></div>
          <div><div className="text-[10px] text-text3">Tiempo</div><div className="font-mono text-[13px]">{lastAnalysis.print.estimated_time_h} h</div></div>
          <div><div className="text-[10px] text-text3">Volumen</div><div className="font-mono text-[13px]">{lastAnalysis.geometry.volume_cm3} cm³</div></div>
          <div><div className="text-[10px] text-text3">Malla</div><div className="font-mono text-[13px]">{lastAnalysis.geometry.is_watertight ? 'OK' : 'Revisar'}</div></div>
        </div>
      )}

      <CostMixer calculator={calculator} />

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="bg-ink-soft rounded-lg p-3 text-center">
          <div className="text-[10px] text-ink font-semibold">Sin IVA</div>
          <div className="font-mono font-bold text-lg text-ink">{calc.total.toFixed(2)} €</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-amber-700 font-semibold">Con IVA</div>
          <div className="font-mono font-bold text-lg text-amber-700">{calc.conIva.toFixed(2)} €</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-emerald-700 font-semibold">Total lote</div>
          <div className="font-mono font-bold text-lg text-emerald-700">{calc.totalLote.toFixed(2)} €</div>
        </div>
      </div>

      <button
        onClick={() => onAddLine({ descripcion: descripcionLinea, cantidad: parseInt(qty) || 1, precio_unitario: calc.total })}
        disabled={addingLine || calc.total <= 0}
        className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-[13px] rounded-md py-2.5 transition-colors">
        {addingLine ? 'Añadiendo...' : 'Añadir como línea al presupuesto'}
      </button>
    </div>
  );
}
