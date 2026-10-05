import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

export default function BienesInversion() {
  const [bienes, setBienes] = useState([]);
  const [status, setStatus] = useState('');
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({ descripcion: '', importe: '', fecha_alta: '', anios_amortizacion: '', notas: '' });

  async function cargar() {
    setBienes(await api('/bienes-inversion'));
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nuevo.descripcion || !nuevo.importe || !nuevo.fecha_alta || !nuevo.anios_amortizacion) {
      setStatus('Faltan datos obligatorios'); return;
    }
    try {
      await api('/bienes-inversion', {
        method: 'POST',
        body: JSON.stringify({
          descripcion: nuevo.descripcion, importe: parseFloat(nuevo.importe),
          fecha_alta: nuevo.fecha_alta, anios_amortizacion: parseFloat(nuevo.anios_amortizacion),
          notas: nuevo.notas,
        }),
      });
      setStatus('✓ Creado');
      setNuevo({ descripcion: '', importe: '', fecha_alta: '', anios_amortizacion: '', notas: '' });
      setMostrarNuevo(false);
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Borrar este bien de inversión?')) return;
    await api(`/bienes-inversion/${id}`, { method: 'DELETE' });
    cargar();
  }

  const totales = bienes.reduce((acc, b) => ({
    importe: acc.importe + b.importe,
    amortizado: acc.amortizado + b.amortizado,
    pendiente: acc.pendiente + b.pendiente,
  }), { importe: 0, amortizado: 0, pendiente: 0 });

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-text mb-1">Bienes de inversión</h1>
      <p className="text-[13px] text-text3 mb-4">
        Compras que no se deducen de golpe, sino que se amortizan a lo largo de varios años.
        Estos también pueden llegarte automáticamente desde una factura marcada como "inmovilizado".
      </p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-border rounded-lg p-3.5">
          <div className="text-[10.5px] text-text3 uppercase">Invertido en total</div>
          <div className="font-mono font-bold text-lg text-text">{totales.importe.toFixed(2)}€</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3.5">
          <div className="text-[10.5px] text-emerald-700 uppercase">Amortizado</div>
          <div className="font-mono font-bold text-lg text-emerald-700">{totales.amortizado.toFixed(2)}€</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3.5">
          <div className="text-[10.5px] text-amber-700 uppercase">Pendiente</div>
          <div className="font-mono font-bold text-lg text-amber-700">{totales.pendiente.toFixed(2)}€</div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[13px] font-semibold text-text">Listado</h2>
          <button onClick={() => setMostrarNuevo(v => !v)} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
            {mostrarNuevo ? 'Cancelar' : '+ Nuevo bien'}
          </button>
        </div>

        {mostrarNuevo && (
          <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2"><label className="text-[11px] text-text3">Descripción</label>
                <input value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Importe (€)</label>
                <input type="number" step="0.01" value={nuevo.importe} onChange={e => setNuevo({ ...nuevo, importe: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Fecha de alta</label>
                <input type="date" value={nuevo.fecha_alta} onChange={e => setNuevo({ ...nuevo, fecha_alta: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Años de amortización</label>
                <input type="number" step="0.5" value={nuevo.anios_amortizacion} onChange={e => setNuevo({ ...nuevo, anios_amortizacion: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Notas</label>
                <input value={nuevo.notas} onChange={e => setNuevo({ ...nuevo, notas: e.target.value })} className={inputClass} /></div>
            </div>
            <button onClick={crear} className="mt-2.5 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3.5 py-1.5">
              Crear
            </button>
            {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
          </div>
        )}

        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
              <th className="pb-1.5 font-semibold">Descripción</th>
              <th className="font-semibold">Alta</th>
              <th className="font-semibold">Importe</th>
              <th className="font-semibold">Años</th>
              <th className="font-semibold">Amortizado</th>
              <th className="font-semibold">Pendiente</th>
              <th className="font-semibold">%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bienes.map(b => (
              <tr key={b.id} className="border-b border-border/60">
                <td className="py-1.5">{b.descripcion}</td>
                <td className="text-text3">{b.fecha_alta}</td>
                <td className="font-mono">{b.importe.toFixed(2)}€</td>
                <td className="font-mono">{b.anios_amortizacion}</td>
                <td className="font-mono text-emerald-700">{b.amortizado.toFixed(2)}€</td>
                <td className="font-mono text-amber-700">{b.pendiente.toFixed(2)}€</td>
                <td>
                  <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden inline-block align-middle mr-1.5">
                    <div className="h-full bg-ink" style={{ width: `${b.porcentaje}%` }} />
                  </div>
                  <span className="text-[10.5px] text-text3">{b.porcentaje}%</span>
                </td>
                <td><button onClick={() => borrar(b.id)} className="text-text3 hover:text-red-500 text-[12px]">✕</button></td>
              </tr>
            ))}
            {bienes.length === 0 && <tr><td colSpan={8} className="text-center text-text3 py-6">Sin bienes de inversión todavía</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
