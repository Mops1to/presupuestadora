import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

export default function Amortizacion() {
  const [printers, setPrinters] = useState([]);
  const [amortizaciones, setAmortizaciones] = useState([]);
  const [printerId, setPrinterId] = useState('');
  const [coste, setCoste] = useState('');
  const [vidaUtil, setVidaUtil] = useState('');
  const [mantenimiento, setMantenimiento] = useState('');
  const [amortStatus, setAmortStatus] = useState('');

  const [cf, setCf] = useState({ alquiler_nave: '', electricidad: '', cuota_autonomos: '', reparaciones: '', inversiones: '', horas_taller_mes: '' });
  const [cfTotales, setCfTotales] = useState({ total_mes: 0, coste_hora: 0 });
  const [cfStatus, setCfStatus] = useState('');

  async function cargarAmortizaciones() {
    setAmortizaciones(await api('/amortizacion'));
  }

  useEffect(() => {
    api('/config').then(c => { setPrinters(c.printers || []); if (c.printers?.length) setPrinterId(c.printers[0].id); });
    cargarAmortizaciones();
    api('/costes-fijos').then(d => {
      setCf({
        alquiler_nave: d.alquiler_nave || '', electricidad: d.electricidad || '', cuota_autonomos: d.cuota_autonomos || '',
        reparaciones: d.reparaciones || '', inversiones: d.inversiones || '', horas_taller_mes: d.horas_taller_mes || '',
      });
      setCfTotales({ total_mes: d.total_mes || 0, coste_hora: d.coste_hora || 0 });
    });
  }, []);

  async function guardarAmort() {
    try {
      await api('/amortizacion', {
        method: 'POST',
        body: JSON.stringify({ printer_id: printerId, coste_compra: parseFloat(coste) || 0, vida_util_h: parseFloat(vidaUtil) || 0, mantenimiento_mes: parseFloat(mantenimiento) || 0 }),
      });
      setAmortStatus('✓ Guardado');
      cargarAmortizaciones();
    } catch (e) { setAmortStatus('Error: ' + e.message); }
  }

  async function guardarCostesFijos() {
    try {
      const body = {
        alquiler_nave: parseFloat(cf.alquiler_nave) || 0, electricidad: parseFloat(cf.electricidad) || 0,
        cuota_autonomos: parseFloat(cf.cuota_autonomos) || 0, reparaciones: parseFloat(cf.reparaciones) || 0,
        inversiones: parseFloat(cf.inversiones) || 0, horas_taller_mes: parseFloat(cf.horas_taller_mes) || 0,
      };
      await api('/costes-fijos', { method: 'POST', body: JSON.stringify(body) });
      const d = await api('/costes-fijos');
      setCfTotales({ total_mes: d.total_mes || 0, coste_hora: d.coste_hora || 0 });
      setCfStatus('✓ Guardado');
    } catch (e) { setCfStatus('Error: ' + e.message); }
  }

  const nombrePrinter = (id) => printers.find(p => p.id === id)?.name || id;

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-text mb-4">Amortización</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Registrar máquina</h2>
          <label className="text-[11px] text-text3">Impresora</label>
          <select value={printerId} onChange={e => setPrinterId(e.target.value)} className={inputClass + ' bg-white'}>
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Coste de compra (€)</label>
          <input type="number" value={coste} onChange={e => setCoste(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Vida útil (h)</label>
          <input type="number" value={vidaUtil} onChange={e => setVidaUtil(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Mantenimiento mensual (€)</label>
          <input type="number" value={mantenimiento} onChange={e => setMantenimiento(e.target.value)} className={inputClass} />
          <button onClick={guardarAmort} className="mt-3 text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
            Guardar
          </button>
          {amortStatus && <div className="text-[11.5px] text-text2 mt-2">{amortStatus}</div>}
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Resumen</h2>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                <th className="pb-1.5 font-semibold">Máquina</th><th className="font-semibold">Compra</th><th className="font-semibold">Vida útil</th><th className="font-semibold">Mant./mes</th>
              </tr>
            </thead>
            <tbody>
              {amortizaciones.map(a => (
                <tr key={a.printer_id} className="border-b border-border/60">
                  <td className="py-1.5">{nombrePrinter(a.printer_id)}</td>
                  <td className="font-mono">{a.coste_compra}€</td>
                  <td className="font-mono">{a.vida_util_h}h</td>
                  <td className="font-mono">{a.mantenimiento_mes}€</td>
                </tr>
              ))}
              {amortizaciones.length === 0 && <tr><td colSpan={4} className="text-text3 py-3">Sin máquinas registradas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5 mt-4">
        <h2 className="text-[13px] font-semibold text-text mb-1">Costes fijos del taller</h2>
        <p className="text-[12px] text-text3 mb-3">
          Gastos mensuales fijos, repartidos entre las horas de taller/máquina disponibles al mes
          (independiente de cuánta gente trabaje) para obtener un coste estructural por hora.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[11px] text-text3">Alquiler nave (€/mes)</label>
            <input type="number" step="0.01" value={cf.alquiler_nave} onChange={e => setCf({ ...cf, alquiler_nave: e.target.value })} className={inputClass} /></div>
          <div><label className="text-[11px] text-text3">Electricidad (€/mes)</label>
            <input type="number" step="0.01" value={cf.electricidad} onChange={e => setCf({ ...cf, electricidad: e.target.value })} className={inputClass} /></div>
          <div><label className="text-[11px] text-text3">Cuota autónomos (€/mes)</label>
            <input type="number" step="0.01" value={cf.cuota_autonomos} onChange={e => setCf({ ...cf, cuota_autonomos: e.target.value })} className={inputClass} /></div>
          <div><label className="text-[11px] text-text3">Reparaciones (€/mes)</label>
            <input type="number" step="0.01" value={cf.reparaciones} onChange={e => setCf({ ...cf, reparaciones: e.target.value })} className={inputClass} /></div>
          <div><label className="text-[11px] text-text3">Inversiones (€/mes)</label>
            <input type="number" step="0.01" value={cf.inversiones} onChange={e => setCf({ ...cf, inversiones: e.target.value })} className={inputClass} /></div>
          <div><label className="text-[11px] text-text3">Horas de taller/máquina al mes</label>
            <input type="number" step="0.1" value={cf.horas_taller_mes} onChange={e => setCf({ ...cf, horas_taller_mes: e.target.value })} className={inputClass} /></div>
        </div>
        <button onClick={guardarCostesFijos} className="mt-3 text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
          Guardar
        </button>
        {cfStatus && <div className="text-[11.5px] text-text2 mt-2">{cfStatus}</div>}

        <div className="flex justify-between items-center mt-3.5 bg-bg-app border border-border rounded-lg px-3.5 py-3">
          <span className="text-[12.5px] text-text3">Total fijo mensual: <span className="font-mono">{cfTotales.total_mes.toFixed(2)} €</span></span>
          <span className="text-[15px] font-bold">Coste estructural: <span className="font-mono text-ink">{cfTotales.coste_hora.toFixed(2)} €/h</span></span>
        </div>
      </div>
    </div>
  );
}
