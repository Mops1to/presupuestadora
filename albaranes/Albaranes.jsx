import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { api } from '../../core/api';

const selectClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white mt-0.5';

export default function Albaranes() {
  const [proyectos, setProyectos] = useState([]);
  const [proyectoId, setProyectoId] = useState('');
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestoId, setPresupuestoId] = useState('');
  const [albaranes, setAlbaranes] = useState([]);
  const [status, setStatus] = useState('');

  const [detalle, setDetalle] = useState(null); // { albaran, lineas }
  const [nuevaDesc, setNuevaDesc] = useState('');
  const [nuevaCant, setNuevaCant] = useState(1);

  useEffect(() => { api('/proyectos').then(setProyectos).catch(() => {}); }, []);

  const cargarPresupuestos = useCallback(async (pid) => {
    if (!pid) { setPresupuestos([]); setPresupuestoId(''); return; }
    const data = await api(`/proyectos/${pid}/presupuestos`);
    setPresupuestos(data);
    setPresupuestoId(data.length ? String(data[0].id) : '');
  }, []);

  const cargarAlbaranes = useCallback(async (pid) => {
    setDetalle(null);
    if (!pid) { setAlbaranes([]); return; }
    setAlbaranes(await api(`/proyectos/${pid}/albaranes`));
  }, []);

  useEffect(() => {
    cargarPresupuestos(proyectoId);
    cargarAlbaranes(proyectoId);
  }, [proyectoId, cargarPresupuestos, cargarAlbaranes]);

  async function abrirAlbaran(id) {
    setDetalle(await api(`/albaranes/${id}`));
  }

  async function generarDesdePresupuesto() {
    if (!presupuestoId) { setStatus('Selecciona un presupuesto con líneas'); return; }
    try {
      const r = await api(`/proyectos/${proyectoId}/albaranes`, { method: 'POST', body: JSON.stringify({ presupuesto_id: presupuestoId }) });
      setStatus(`✓ Generado ${r.numero}`);
      await cargarAlbaranes(proyectoId);
      abrirAlbaran(r.id);
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function crearEnBlanco() {
    if (!proyectoId) { setStatus('Selecciona un proyecto'); return; }
    try {
      const r = await api(`/proyectos/${proyectoId}/albaranes`, { method: 'POST', body: JSON.stringify({}) });
      setStatus(`✓ Generado ${r.numero}`);
      await cargarAlbaranes(proyectoId);
      abrirAlbaran(r.id);
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function actualizarEstado(estado) {
    await api(`/albaranes/${detalle.albaran.id}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
    setDetalle(d => ({ ...d, albaran: { ...d.albaran, estado } }));
    cargarAlbaranes(proyectoId);
  }

  async function actualizarNotas(notas) {
    setDetalle(d => ({ ...d, albaran: { ...d.albaran, notas } }));
    await api(`/albaranes/${detalle.albaran.id}`, { method: 'PATCH', body: JSON.stringify({ notas }) });
  }

  async function anadirLinea() {
    if (!nuevaDesc.trim()) return;
    await api(`/albaranes/${detalle.albaran.id}/lineas`, { method: 'POST', body: JSON.stringify({ descripcion: nuevaDesc, cantidad: parseFloat(nuevaCant) || 1 }) });
    setNuevaDesc(''); setNuevaCant(1);
    abrirAlbaran(detalle.albaran.id);
  }

  async function borrarLinea(lineaId) {
    await api(`/albaranes/${detalle.albaran.id}/lineas/${lineaId}`, { method: 'DELETE' });
    abrirAlbaran(detalle.albaran.id);
  }

  async function borrarAlbaran(id) {
    if (!confirm('¿Borrar este albarán?')) return;
    await api(`/albaranes/${id}`, { method: 'DELETE' });
    if (detalle?.albaran.id === id) setDetalle(null);
    cargarAlbaranes(proyectoId);
  }

  async function exportar() {
    try {
      const res = await api(`/albaranes/${detalle.albaran.id}/exportar`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `Albaran_${detalle.albaran.id}.docx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Error exportando: ' + e.message); }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-text mb-4">Albaranes</h1>

      <div className="bg-white border border-border rounded-xl p-5 mb-4">
        <h2 className="text-[13px] font-semibold text-text mb-3">Generar albarán</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-text3">Proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className={selectClass}>
              <option value="">— selecciona —</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre || '(sin nombre)'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text3">Generar desde presupuesto (hereda sus líneas)</label>
            <select value={presupuestoId} onChange={e => setPresupuestoId(e.target.value)} className={selectClass}>
              {presupuestos.length === 0 && <option value="">— sin presupuestos —</option>}
              {presupuestos.map(p => <option key={p.id} value={p.id}>v{p.version} — {p.estado} — {p.importe.toFixed(2)}€</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={generarDesdePresupuesto} className="flex-1 text-[12.5px] font-semibold rounded-md px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              Generar
            </button>
            <button onClick={crearEnBlanco} className="flex-1 text-[12.5px] rounded-md px-3 py-1.5 border border-border text-text2 hover:bg-bg-app">
              En blanco
            </button>
          </div>
        </div>
        {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden mb-4">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
              <th className="px-3 py-2 font-semibold">Nº</th><th className="font-semibold">Fecha</th><th className="font-semibold">Estado</th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {albaranes.map(a => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="px-3 py-2 font-mono text-ink">{a.numero}</td>
                <td className="text-text3">{(a.fecha || '').slice(0, 10)}</td>
                <td>{a.estado}</td>
                <td><button onClick={() => abrirAlbaran(a.id)} className="text-[11.5px] border border-border rounded px-2 py-1 text-text2 hover:bg-bg-app">Ver</button></td>
                <td className="pr-3"><button onClick={() => borrarAlbaran(a.id)} className="text-text3 hover:text-red-500"><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {albaranes.length === 0 && <tr><td colSpan={5} className="text-center text-text3 py-4">Sin albaranes todavía</td></tr>}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="bg-white border border-border rounded-xl p-5">
          <div className="flex justify-between items-start mb-3">
            <h2 className="text-[14px] font-semibold text-ink font-mono">{detalle.albaran.numero}</h2>
            <button onClick={() => setDetalle(null)} className="text-text3 hover:text-text text-[12px]">Cerrar</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[11px] text-text3">Estado</label>
              <select value={detalle.albaran.estado} onChange={e => actualizarEstado(e.target.value)} className={selectClass}>
                <option value="emitido">Emitido</option>
                <option value="entregado">Entregado</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text3">Notas</label>
              <input value={detalle.albaran.notas || ''} onChange={e => actualizarNotas(e.target.value)} className={selectClass + ' bg-white'} />
            </div>
          </div>

          <table className="w-full text-[12px] mb-3">
            <thead>
              <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                <th className="pb-1.5 font-semibold">Descripción</th><th className="font-semibold">Cantidad</th><th></th>
              </tr>
            </thead>
            <tbody>
              {detalle.lineas.map(l => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-1.5">{l.descripcion}</td>
                  <td className="font-mono">{l.cantidad}</td>
                  <td><button onClick={() => borrarLinea(l.id)} className="text-text3 hover:text-red-500"><Trash2 size={12} /></button></td>
                </tr>
              ))}
              {detalle.lineas.length === 0 && <tr><td colSpan={3} className="text-text3 py-2">Sin líneas — añade alguna abajo</td></tr>}
            </tbody>
          </table>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <input value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} placeholder="Descripción"
              className="text-[12px] border border-border rounded-md px-2 py-1.5" />
            <input type="number" value={nuevaCant} onChange={e => setNuevaCant(e.target.value)} placeholder="Cantidad"
              className="text-[12px] border border-border rounded-md px-2 py-1.5" />
            <button onClick={anadirLinea} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
              + Añadir línea
            </button>
          </div>

          <button onClick={exportar} className="flex items-center gap-1.5 bg-ink hover:bg-ink-light text-white text-[12.5px] font-semibold rounded-md px-4 py-2">
            <Download size={14} /> Exportar Word
          </button>
        </div>
      )}
    </div>
  );
}
