import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';
const TIPOS = [
  { id: 'hotend', label: 'Hotend/nozzle' },
  { id: 'fep', label: 'FEP' },
  { id: 'reparacion', label: 'Reparación' },
  { id: 'otro', label: 'Otro' },
];

export default function Consumibles() {
  const [printers, setPrinters] = useState([]);
  const [rows, setRows] = useState([]);
  const [printerId, setPrinterId] = useState('');
  const [tipo, setTipo] = useState('hotend');
  const [descripcion, setDescripcion] = useState('');
  const [coste, setCoste] = useState('');
  const [fecha, setFecha] = useState('');
  const [status, setStatus] = useState('');

  async function cargar() {
    setRows(await api('/consumibles'));
  }

  useEffect(() => {
    api('/config').then(c => { setPrinters(c.printers || []); if (c.printers?.length) setPrinterId(c.printers[0].id); });
    cargar();
  }, []);

  async function registrar() {
    try {
      await api('/consumibles', {
        method: 'POST',
        body: JSON.stringify({
          fecha: fecha || new Date().toISOString().slice(0, 10),
          printer_id: printerId, tipo, descripcion, coste: parseFloat(coste) || 0,
        }),
      });
      setStatus('✓ Registrado');
      setDescripcion(''); setCoste('');
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  const nombrePrinter = (id) => printers.find(p => p.id === id)?.name || id;

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-text mb-4">Consumibles</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Registrar gasto</h2>
          <label className="text-[11px] text-text3">Máquina</label>
          <select value={printerId} onChange={e => setPrinterId(e.target.value)} className={inputClass + ' bg-white'}>
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputClass + ' bg-white'}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Descripción</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Coste (€)</label>
          <input type="number" step="0.01" value={coste} onChange={e => setCoste(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputClass} />
          <button onClick={registrar} className="mt-3 text-[12.5px] font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-md px-4 py-2">
            Registrar
          </button>
          {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Historial</h2>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border sticky top-0 bg-white">
                  <th className="pb-1.5 font-semibold">Fecha</th><th className="font-semibold">Máquina</th><th className="font-semibold">Tipo</th><th className="font-semibold">Desc.</th><th className="font-semibold">€</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-1.5 text-text3">{r.fecha || ''}</td>
                    <td>{nombrePrinter(r.printer_id)}</td>
                    <td>{r.tipo}</td>
                    <td>{r.descripcion || ''}</td>
                    <td className="font-mono">{r.coste}€</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="text-text3 py-3">Sin registros</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
