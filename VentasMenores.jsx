import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

const PLATAFORMAS_VENTA = ['Wallapop', 'Vinted', 'En mano'];

export default function VentasMenores() {
  const [rol, setRol] = useState(null);
  const esMaster = rol === 'master';

  const [ventas, setVentas] = useState([]);
  const [nuevaVenta, setNuevaVenta] = useState({ fecha: '', plataforma: '', producto: '', coste_fabricacion: '', coste_venta: '', margen_myrox: '' });
  const [statusVentas, setStatusVentas] = useState('');
  const [editandoMargen, setEditandoMargen] = useState({}); // { [id]: valorEnEdicion }
  const [plataformaPersonalizada, setPlataformaPersonalizada] = useState(false);

  function cargarVentas() {
    api('/ventas-menores').then(setVentas).catch(() => {});
  }

  useEffect(() => {
    api('/auth/me').then(u => setRol(u.rol)).catch(() => {});
    cargarVentas();
  }, []);

  async function crearVenta() {
    if (!nuevaVenta.fecha || nuevaVenta.coste_venta === '') { setStatusVentas('Faltan fecha y/o coste de venta'); return; }
    try {
      await api('/ventas-menores', {
        method: 'POST',
        body: JSON.stringify({
          ...nuevaVenta,
          coste_fabricacion: parseFloat(nuevaVenta.coste_fabricacion) || 0,
          coste_venta: parseFloat(nuevaVenta.coste_venta),
          margen_myrox: nuevaVenta.margen_myrox !== '' ? parseFloat(nuevaVenta.margen_myrox) : undefined,
        }),
      });
      setStatusVentas('✓ Venta registrada');
      setNuevaVenta({ fecha: '', plataforma: '', producto: '', coste_fabricacion: '', coste_venta: '', margen_myrox: '' });
      cargarVentas();
    } catch (e) { setStatusVentas('Error: ' + e.message); }
  }

  async function guardarCampo(id, campo, valor) {
    try {
      await api(`/ventas-menores/${id}`, { method: 'PATCH', body: JSON.stringify({ [campo]: valor }) });
      cargarVentas();
    } catch (e) { setStatusVentas('Error: ' + e.message); }
  }

  async function guardarMargen(id) {
    const valor = parseFloat(editandoMargen[id]);
    if (Number.isNaN(valor)) { setStatusVentas('Pon un número válido para el margen'); return; }
    await guardarCampo(id, 'margen_myrox', valor);
    setEditandoMargen(prev => { const copia = { ...prev }; delete copia[id]; return copia; });
  }

  async function borrarVenta(id) {
    if (!confirm('¿Borrar esta venta?')) return;
    try {
      await api(`/ventas-menores/${id}`, { method: 'DELETE' });
      cargarVentas();
    } catch (e) { setStatusVentas('Error: ' + e.message); }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Ventas menores</h1>
          <p className="text-[13px] text-text3 mb-3">
            {esMaster
              ? 'Ves las ventas de todo el mundo. El margen Myrox solo lo puedes fijar tú, en cualquier venta.'
              : 'Solo ves tus propias ventas — nadie más ve las tuyas, ni tú las de los demás.'}
          </p>

          <div className="bg-white border border-border rounded-xl p-4 mb-4">
            <h2 className="text-[13px] font-semibold text-text mb-3">Registrar venta</h2>
            <div className="grid grid-cols-4 gap-2.5 mb-3">
              <div><label className="text-[11px] text-text3">Fecha</label>
                <input type="date" value={nuevaVenta.fecha} onChange={e => setNuevaVenta({ ...nuevaVenta, fecha: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Plataforma</label>
                {plataformaPersonalizada ? (
                  <input value={nuevaVenta.plataforma} onChange={e => setNuevaVenta({ ...nuevaVenta, plataforma: e.target.value })}
                    placeholder="Escribe la plataforma" autoFocus
                    onBlur={() => { if (!nuevaVenta.plataforma) setPlataformaPersonalizada(false); }}
                    className={inputClass} />
                ) : (
                  <select value={nuevaVenta.plataforma}
                    onChange={e => { if (e.target.value === '__nueva__') { setPlataformaPersonalizada(true); setNuevaVenta({ ...nuevaVenta, plataforma: '' }); } else { setNuevaVenta({ ...nuevaVenta, plataforma: e.target.value }); } }}
                    className={inputClass + ' bg-white'}>
                    <option value="">— selecciona —</option>
                    {PLATAFORMAS_VENTA.map(p => <option key={p} value={p}>{p}</option>)}
                    <option value="__nueva__">+ Otra (escribir)...</option>
                  </select>
                )}</div>
              <div><label className="text-[11px] text-text3">Producto</label>
                <input value={nuevaVenta.producto} onChange={e => setNuevaVenta({ ...nuevaVenta, producto: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Coste fabricación (€)</label>
                <input type="number" step="0.01" value={nuevaVenta.coste_fabricacion} onChange={e => setNuevaVenta({ ...nuevaVenta, coste_fabricacion: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Coste de venta (€)</label>
                <input type="number" step="0.01" value={nuevaVenta.coste_venta} onChange={e => setNuevaVenta({ ...nuevaVenta, coste_venta: e.target.value })} className={inputClass} /></div>
              {esMaster && (
                <div><label className="text-[11px] text-text3">Margen Myrox (€)</label>
                  <input type="number" step="0.01" value={nuevaVenta.margen_myrox} onChange={e => setNuevaVenta({ ...nuevaVenta, margen_myrox: e.target.value })} className={inputClass} /></div>
              )}
            </div>
            <button onClick={crearVenta} className="text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
              Registrar
            </button>
            {statusVentas && <div className="text-[11.5px] text-text2 mt-2">{statusVentas}</div>}
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="font-semibold">Producto</th>
                  {esMaster && <th className="font-semibold">Vendedor</th>}
                  <th className="font-semibold">Coste fabr.</th>
                  <th className="font-semibold">Coste venta</th>
                  <th className="font-semibold">Margen Myrox</th>
                  <th className="font-semibold">Comisión</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-text3">{(v.fecha || '').slice(0, 10)}</td>
                    <td>{v.producto || '—'}</td>
                    {esMaster && <td className="text-text3">{v.vendedor}</td>}
                    <td className="font-mono">
                      <input type="number" step="0.01" defaultValue={v.coste_fabricacion}
                        onBlur={e => { const val = parseFloat(e.target.value); if (!Number.isNaN(val) && val !== v.coste_fabricacion) guardarCampo(v.id, 'coste_fabricacion', val); }}
                        className="w-20 border border-transparent hover:border-border rounded px-1 py-0.5 focus:border-border" />
                    </td>
                    <td className="font-mono">
                      <input type="number" step="0.01" defaultValue={v.coste_venta}
                        onBlur={e => { const val = parseFloat(e.target.value); if (!Number.isNaN(val) && val !== v.coste_venta) guardarCampo(v.id, 'coste_venta', val); }}
                        className="w-20 border border-transparent hover:border-border rounded px-1 py-0.5 focus:border-border" />
                    </td>
                    <td className="font-mono">
                      {esMaster ? (
                        <input type="number" step="0.01"
                          value={editandoMargen[v.id] ?? v.margen_myrox}
                          onChange={e => setEditandoMargen(prev => ({ ...prev, [v.id]: e.target.value }))}
                          onBlur={() => editandoMargen[v.id] !== undefined && guardarMargen(v.id)}
                          className="w-20 border border-transparent hover:border-border rounded px-1 py-0.5 focus:border-border" />
                      ) : (
                        <span className="text-text3">{v.margen_myrox.toFixed(2)}€</span>
                      )}
                    </td>
                    <td className="font-mono font-semibold text-emerald-700">{v.comision_personal.toFixed(2)}€</td>
                    <td><button onClick={() => borrarVenta(v.id)} className="text-text3 hover:text-red-500">✕</button></td>
                  </tr>
                ))}
                {ventas.length === 0 && <tr><td colSpan={esMaster ? 8 : 7} className="text-center text-text3 py-6">Sin ventas todavía</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
  );
}
