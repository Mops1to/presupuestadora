import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { api } from '../../core/api';
import { useCalculator } from './useCalculator';
import Calculator from './Calculator';

export default function Presupuestador() {
  const [config, setConfig] = useState(null);
  const [costeEstructuralHora, setCosteEstructuralHora] = useState(0);
  const [proyectos, setProyectos] = useState([]);
  const [proyectoId, setProyectoId] = useState('');
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestoId, setPresupuestoId] = useState('');
  const [detalle, setDetalle] = useState(null); // { presupuesto, lineas }
  const [status, setStatus] = useState('');
  const [addingLine, setAddingLine] = useState(false);
  const [nuevaLinea, setNuevaLinea] = useState({ descripcion: '', cantidad: 1, precio_unitario: '' });
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [notasComerciales, setNotasComerciales] = useState('');

  const calculator = useCalculator(config, costeEstructuralHora);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
    api('/costes-fijos').then(d => setCosteEstructuralHora(d.coste_hora || 0)).catch(() => {});
    api('/proyectos').then(setProyectos).catch(() => {});
  }, []);

  const cargarPresupuestos = useCallback(async (pid) => {
    if (!pid) { setPresupuestos([]); setPresupuestoId(''); setDetalle(null); return; }
    const data = await api(`/proyectos/${pid}/presupuestos`);
    setPresupuestos(data);
    if (data.length) setPresupuestoId(String(data[0].id));
    else { setPresupuestoId(''); setDetalle(null); }
  }, []);

  useEffect(() => { cargarPresupuestos(proyectoId); }, [proyectoId, cargarPresupuestos]);

  const cargarDetalle = useCallback(async (pid) => {
    if (!pid) { setDetalle(null); return; }
    const data = await api(`/presupuestos/${pid}`);
    setDetalle(data);
    setDescuentoPct(data.presupuesto.descuento_pct || 0);
    setNotasComerciales(data.presupuesto.notas_comerciales || '');
  }, []);

  useEffect(() => { cargarDetalle(presupuestoId); }, [presupuestoId, cargarDetalle]);

  async function crearVersion() {
    if (!proyectoId) { setStatus('Selecciona un proyecto primero'); return; }
    try {
      const res = await api(`/proyectos/${proyectoId}/presupuestos`, { method: 'POST', body: JSON.stringify({}) });
      setStatus(`✓ Presupuesto v${res.version} creado`);
      await cargarPresupuestos(proyectoId);
      setPresupuestoId(String(res.id));
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function cambiarEstado(estado) {
    if (!presupuestoId) return;
    await api(`/presupuestos/${presupuestoId}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
    cargarDetalle(presupuestoId);
  }

  async function guardarComercial() {
    try {
      await api(`/presupuestos/${presupuestoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ descuento_pct: parseFloat(descuentoPct) || 0, notas_comerciales: notasComerciales }),
      });
      setStatus('✓ Guardado');
      cargarDetalle(presupuestoId);
      cargarPresupuestos(proyectoId);
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function anadirLinea(body) {
    if (!presupuestoId) { setStatus('Selecciona un presupuesto arriba'); return; }
    setAddingLine(true);
    try {
      await api(`/presupuestos/${presupuestoId}/lineas`, { method: 'POST', body: JSON.stringify({ tipo: 'impresion_3d', ...body }) });
      setStatus('✓ Añadido al presupuesto');
      cargarDetalle(presupuestoId);
      cargarPresupuestos(proyectoId);
    } catch (e) { setStatus('Error: ' + e.message); }
    setAddingLine(false);
  }

  async function anadirLineaManual() {
    if (!nuevaLinea.descripcion.trim()) return;
    await anadirLinea({
      tipo: 'manual',
      descripcion: nuevaLinea.descripcion,
      cantidad: parseFloat(nuevaLinea.cantidad) || 1,
      precio_unitario: parseFloat(nuevaLinea.precio_unitario) || 0,
    });
    setNuevaLinea({ descripcion: '', cantidad: 1, precio_unitario: '' });
  }

  async function borrarLinea(lineaId) {
    await api(`/presupuestos/${presupuestoId}/lineas/${lineaId}`, { method: 'DELETE' });
    cargarDetalle(presupuestoId);
    cargarPresupuestos(proyectoId);
  }

  async function exportar() {
    setStatus('Generando documento...');
    try {
      const res = await api(`/presupuestos/${presupuestoId}/exportar`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `Presupuesto_${presupuestoId}.docx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
      setStatus('✓ Documento descargado');
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  const selectClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white';

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-text mb-4">Presupuestador</h1>

      <div className="bg-white border border-border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-text3">Proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className={selectClass + ' mt-0.5'}>
              <option value="">— selecciona —</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre || '(sin nombre)'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text3">Presupuesto (versión)</label>
            <select value={presupuestoId} onChange={e => setPresupuestoId(e.target.value)} className={selectClass + ' mt-0.5'}>
              {presupuestos.length === 0 && <option value="">— sin presupuestos, crea uno —</option>}
              {presupuestos.map(p => <option key={p.id} value={p.id}>v{p.version} — {p.estado} — {p.importe.toFixed(2)}€</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={crearVersion} className="w-full text-[12.5px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
              + Nueva versión
            </button>
          </div>
        </div>
        {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
      </div>

      {detalle && (
        <>
          <div className="bg-white border border-border rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[13px] font-semibold text-text">Líneas del presupuesto</h2>
              <div className="flex items-center gap-3">
                <select value={detalle.presupuesto.estado} onChange={e => cambiarEstado(e.target.value)}
                  className="text-[12px] border border-border rounded-md px-2 py-1 bg-white">
                  <option value="borrador">Borrador</option>
                  <option value="enviado">Enviado</option>
                  <option value="aceptado">Aceptado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
                <span className="font-mono font-bold text-ink text-[14px]">{detalle.presupuesto.importe.toFixed(2)} €</span>
              </div>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                  <th className="pb-1.5 font-semibold">Tipo</th><th className="font-semibold">Descripción</th>
                  <th className="font-semibold">Cant.</th><th className="font-semibold">€/ud</th><th className="font-semibold">Importe</th><th></th>
                </tr>
              </thead>
              <tbody>
                {detalle.lineas.map(l => (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className="py-1.5">{l.tipo}</td>
                    <td>{l.descripcion}</td>
                    <td className="font-mono">{l.cantidad}</td>
                    <td className="font-mono">{l.precio_unitario}€</td>
                    <td className="font-mono">{l.importe}€</td>
                    <td><button onClick={() => borrarLinea(l.id)} className="text-text3 hover:text-red-500"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border">
              <input value={nuevaLinea.descripcion} onChange={e => setNuevaLinea({ ...nuevaLinea, descripcion: e.target.value })}
                placeholder="Descripción de línea manual" className="col-span-2 text-[12px] border border-border rounded-md px-2 py-1.5" />
              <input type="number" value={nuevaLinea.cantidad} onChange={e => setNuevaLinea({ ...nuevaLinea, cantidad: e.target.value })}
                placeholder="Cant." className="text-[12px] border border-border rounded-md px-2 py-1.5" />
              <input type="number" value={nuevaLinea.precio_unitario} onChange={e => setNuevaLinea({ ...nuevaLinea, precio_unitario: e.target.value })}
                placeholder="€/ud" className="text-[12px] border border-border rounded-md px-2 py-1.5" />
              <button onClick={anadirLineaManual} className="col-span-4 text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
                + Añadir línea manual
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-end gap-3 mb-3">
                <div>
                  <label className="text-[11px] text-text3">Descuento (%)</label>
                  <input type="number" step="1" min="0" max="100" value={descuentoPct} onChange={e => setDescuentoPct(e.target.value)}
                    className="w-24 text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5" />
                </div>
                {parseFloat(descuentoPct) > 0 && (
                  <div className="text-[12px] text-text3 pb-1.5">
                    Total con descuento e IVA: <span className="font-mono font-semibold text-ink">
                      {(detalle.presupuesto.importe * (1 - (parseFloat(descuentoPct) || 0) / 100) * 1.21).toFixed(2)} €
                    </span>
                  </div>
                )}
              </div>
              <label className="text-[11px] text-text3">Descripción comercial (para argumentar la venta en el Word — qué se va a hacer, por qué, etc.)</label>
              <textarea value={notasComerciales} onChange={e => setNotasComerciales(e.target.value)} rows={5}
                placeholder="Ej: Proponemos digitalizar las piezas mediante escaneo 3D de precisión, generando un informe comparativo..."
                className="w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5" />
              <button onClick={guardarComercial} className="mt-2 text-[12px] font-semibold border border-border rounded-md px-3.5 py-1.5 text-text2 hover:bg-bg-app">
                Guardar descuento y descripción
              </button>
            </div>

            <button onClick={exportar} className="mt-4 flex items-center gap-1.5 bg-ink hover:bg-ink-light text-white text-[12.5px] font-semibold rounded-md px-4 py-2">
              <Download size={14} /> Exportar Word
            </button>
            {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
          </div>

          <h2 className="text-[13px] font-semibold text-text mb-2">Calculadora de impresión 3D</h2>
          <Calculator calculator={calculator} onAddLine={anadirLinea} addingLine={addingLine} />
        </>
      )}
    </div>
  );
}
