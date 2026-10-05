import { useEffect, useMemo, useState } from 'react';
import { Pencil, Minus } from 'lucide-react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

function etiquetaReferencia(r) {
  const partes = [r.fabricante, r.material, r.color, r.formato].filter(Boolean);
  const base = partes.join(' · ') || `Referencia #${r.id}`;
  // Si la IA no pudo clasificar bien (todo genérico tipo "Otro · servicio"),
  // añadimos el proveedor para poder distinguir referencias que si no serían
  // indistinguibles unas de otras en la lista.
  const generica = partes.every(p => ['otro', 'servicio', 'unidad'].some(g => p.toLowerCase().includes(g)));
  if (generica && r.proveedor_nombre) return `${base} (${r.proveedor_nombre})`;
  return base;
}

export default function Stock() {
  const [referencias, setReferencias] = useState([]);
  const [status, setStatus] = useState('');
  const [filtro, setFiltro] = useState('');
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);

  const [inRef, setInRef] = useState('');
  const [inQty, setInQty] = useState('');
  const [inCoste, setInCoste] = useState('');
  const [inNotas, setInNotas] = useState('');
  const [inStatus, setInStatus] = useState('');

  const [outRef, setOutRef] = useState('');
  const [outQty, setOutQty] = useState('');
  const [outNotas, setOutNotas] = useState('');
  const [outStatus, setOutStatus] = useState('');

  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [nueva, setNueva] = useState({
    fabricante: '', material: '', color: '', formato: '', proveedor_nombre: '',
    sku_proveedor: '', cantidad: '', precio_medio: '', stock_minimo: '', notas: '',
  });
  const [nuevaStatus, setNuevaStatus] = useState('');

  const [editando, setEditando] = useState(null); // referencia completa en edición, o null
  const [editStatus, setEditStatus] = useState('');

  async function cargarReferencias() {
    const data = await api('/stock-referencias');
    setReferencias(data);
    if (data.length) {
      if (!inRef) setInRef(String(data[0].id));
      if (!outRef) setOutRef(String(data[0].id));
    }
  }

  useEffect(() => { cargarReferencias(); }, []);

  const referenciasFiltradas = useMemo(() => {
    let lista = referencias;
    if (soloBajoMinimo) lista = lista.filter(r => r.cantidad <= r.stock_minimo);
    if (filtro.trim()) {
      const q = filtro.trim().toLowerCase();
      lista = lista.filter(r =>
        [r.fabricante, r.material, r.color, r.formato, r.proveedor_nombre, r.notas]
          .filter(Boolean).some(campo => campo.toLowerCase().includes(q)));
    }
    return lista;
  }, [referencias, filtro, soloBajoMinimo]);

  async function registrarEntrada() {
    if (!inRef) { setInStatus('Selecciona una referencia'); return; }
    try {
      await api(`/stock-referencias/${inRef}/entrada`, {
        method: 'POST',
        body: JSON.stringify({ cantidad: parseFloat(inQty) || 0, coste_total: parseFloat(inCoste) || 0, notas: inNotas }),
      });
      setInStatus('✓ Entrada registrada');
      setInQty(''); setInCoste(''); setInNotas('');
      cargarReferencias();
    } catch (e) { setInStatus('Error: ' + e.message); }
  }

  async function registrarSalida(refId, cantidad, notas) {
    try {
      await api(`/stock-referencias/${refId}/salida`, {
        method: 'POST',
        body: JSON.stringify({ cantidad: parseFloat(cantidad) || 0, notas }),
      });
      cargarReferencias();
      return true;
    } catch (e) { setStatus('Error: ' + e.message); return false; }
  }

  async function onRegistrarSalidaForm() {
    if (!outRef) { setOutStatus('Selecciona una referencia'); return; }
    const ok = await registrarSalida(outRef, outQty, outNotas);
    if (ok) { setOutStatus('✓ Salida registrada'); setOutQty(''); setOutNotas(''); }
  }

  async function gastarUno(r) {
    if (r.cantidad < 1) { setStatus(`${etiquetaReferencia(r)}: no queda ni 1 unidad para descontar`); return; }
    const ok = await registrarSalida(r.id, 1, 'Consumido en taller (botón rápido)');
    if (ok) setStatus(`✓ -1 en ${etiquetaReferencia(r)}`);
  }

  async function crearReferencia() {
    if (!nueva.fabricante.trim() && !nueva.material.trim()) {
      setNuevaStatus('Pon al menos fabricante o material');
      return;
    }
    try {
      await api('/stock-referencias', {
        method: 'POST',
        body: JSON.stringify({
          fabricante: nueva.fabricante, material: nueva.material, color: nueva.color, formato: nueva.formato,
          proveedor_nombre: nueva.proveedor_nombre || undefined, sku_proveedor: nueva.sku_proveedor,
          cantidad: parseFloat(nueva.cantidad) || 0, precio_medio: parseFloat(nueva.precio_medio) || 0,
          stock_minimo: parseFloat(nueva.stock_minimo) || 0, notas: nueva.notas,
        }),
      });
      setNuevaStatus('✓ Referencia creada');
      setNueva({ fabricante: '', material: '', color: '', formato: '', proveedor_nombre: '', sku_proveedor: '', cantidad: '', precio_medio: '', stock_minimo: '', notas: '' });
      cargarReferencias();
    } catch (e) { setNuevaStatus('Error: ' + e.message); }
  }

  async function guardarEdicion() {
    try {
      await api(`/stock-referencias/${editando.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fabricante: editando.fabricante, material: editando.material, color: editando.color,
          formato: editando.formato, stock_minimo: parseFloat(editando.stock_minimo) || 0,
          notas: editando.notas,
        }),
      });
      setEditando(null);
      cargarReferencias();
    } catch (e) { setEditStatus('Error: ' + e.message); }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-4">Stock</h1>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Entrada de stock</h2>
          <label className="text-[11px] text-text3">Referencia</label>
          <select value={inRef} onChange={e => setInRef(e.target.value)} className={inputClass + ' bg-white'}>
            {referencias.map(r => <option key={r.id} value={r.id}>{etiquetaReferencia(r)}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Cantidad</label>
          <input type="number" step="0.001" value={inQty} onChange={e => setInQty(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Coste total (€)</label>
          <input type="number" step="0.01" value={inCoste} onChange={e => setInCoste(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Notas</label>
          <input value={inNotas} onChange={e => setInNotas(e.target.value)} className={inputClass} />
          <button onClick={registrarEntrada} className="mt-3 text-[12.5px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2">
            Registrar entrada
          </button>
          {inStatus && <div className="text-[11.5px] text-text2 mt-2">{inStatus}</div>}
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Salida de stock</h2>
          <label className="text-[11px] text-text3">Referencia</label>
          <select value={outRef} onChange={e => setOutRef(e.target.value)} className={inputClass + ' bg-white'}>
            {referencias.map(r => <option key={r.id} value={r.id}>{etiquetaReferencia(r)}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Cantidad</label>
          <input type="number" step="0.001" value={outQty} onChange={e => setOutQty(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Motivo</label>
          <input value={outNotas} onChange={e => setOutNotas(e.target.value)} className={inputClass} />
          <button onClick={onRegistrarSalidaForm} className="mt-3 text-[12.5px] font-semibold bg-red-500 hover:bg-red-600 text-white rounded-md px-4 py-2">
            Registrar salida
          </button>
          {outStatus && <div className="text-[11.5px] text-text2 mt-2">{outStatus}</div>}
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5 mb-4">
        <div className="flex justify-between items-center mb-3 gap-3">
          <h2 className="text-[13px] font-semibold text-text shrink-0">Inventario</h2>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por fabricante, material, proveedor..."
              className="text-[12px] border border-border rounded-md px-2.5 py-1.5 w-64" />
            <label className="flex items-center gap-1.5 text-[11.5px] text-text2 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={soloBajoMinimo} onChange={e => setSoloBajoMinimo(e.target.checked)} className="accent-ink" />
              Solo bajo mínimo
            </label>
            <button onClick={() => setMostrarNueva(v => !v)} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app whitespace-nowrap">
              {mostrarNueva ? 'Cancelar' : '+ Nueva referencia'}
            </button>
          </div>
        </div>
        {status && <div className="text-[11.5px] text-text2 mb-2">{status}</div>}

        {mostrarNueva && (
          <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
            <div className="grid grid-cols-4 gap-2.5">
              <div><label className="text-[11px] text-text3">Fabricante</label>
                <input value={nueva.fabricante} onChange={e => setNueva({ ...nueva, fabricante: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Material</label>
                <input value={nueva.material} onChange={e => setNueva({ ...nueva, material: e.target.value })} placeholder="PLA+, PETG..." className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Color</label>
                <input value={nueva.color} onChange={e => setNueva({ ...nueva, color: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Formato</label>
                <input value={nueva.formato} onChange={e => setNueva({ ...nueva, formato: e.target.value })} placeholder="1kg, 750g..." className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Proveedor</label>
                <input value={nueva.proveedor_nombre} onChange={e => setNueva({ ...nueva, proveedor_nombre: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">SKU proveedor</label>
                <input value={nueva.sku_proveedor} onChange={e => setNueva({ ...nueva, sku_proveedor: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Cantidad inicial</label>
                <input type="number" step="0.001" value={nueva.cantidad} onChange={e => setNueva({ ...nueva, cantidad: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Precio medio inicial (€)</label>
                <input type="number" step="0.01" value={nueva.precio_medio} onChange={e => setNueva({ ...nueva, precio_medio: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Stock mínimo</label>
                <input type="number" step="0.001" value={nueva.stock_minimo} onChange={e => setNueva({ ...nueva, stock_minimo: e.target.value })} className={inputClass} /></div>
              <div className="col-span-3"><label className="text-[11px] text-text3">Notas</label>
                <input value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} className={inputClass} /></div>
            </div>
            <button onClick={crearReferencia} className="mt-2.5 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3.5 py-1.5">
              Crear referencia
            </button>
            {nuevaStatus && <div className="text-[11.5px] text-text2 mt-2">{nuevaStatus}</div>}
          </div>
        )}

        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
              <th className="pb-1.5 font-semibold">Referencia</th>
              <th className="font-semibold">Proveedor</th>
              <th className="font-semibold">Cantidad</th>
              <th className="font-semibold">Mínimo</th>
              <th className="font-semibold">Precio medio</th>
              <th className="font-semibold">Precio último</th>
              <th className="font-semibold">Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {referenciasFiltradas.map(r => {
              const bajoMinimo = r.cantidad <= r.stock_minimo;
              return (
                <tr key={r.id} className={`border-b border-border/60 ${bajoMinimo ? 'bg-red-50' : ''}`}>
                  <td className="py-1.5 font-medium text-text">{etiquetaReferencia(r)}</td>
                  <td className="text-text3">{r.proveedor_nombre || '—'}</td>
                  <td className={`font-mono ${bajoMinimo ? 'text-red-600 font-semibold' : ''}`}>{r.cantidad.toFixed(3)}</td>
                  <td className="font-mono text-text3">{r.stock_minimo.toFixed(3)}</td>
                  <td className="font-mono">{r.precio_medio.toFixed(2)}€</td>
                  <td className="font-mono">{r.precio_ultimo.toFixed(2)}€</td>
                  <td className="font-mono">{(r.cantidad * r.precio_medio).toFixed(2)}€</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => gastarUno(r)} title="Gastar 1 unidad (rápido, sin buscar)"
                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-border text-text3 hover:bg-red-50 hover:text-red-600 hover:border-red-200 mr-1">
                      <Minus size={12} />
                    </button>
                    <button onClick={() => { setEditando({ ...r }); setEditStatus(''); }} title="Editar referencia"
                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-border text-text3 hover:bg-bg-app">
                      <Pencil size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {referenciasFiltradas.length === 0 && <tr><td colSpan={8} className="text-text3 py-3 text-center">Sin referencias con estos filtros</td></tr>}
          </tbody>
        </table>
      </div>

      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-xl w-[480px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-text mb-3">Editar referencia</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className="text-[11px] text-text3">Fabricante</label>
                <input value={editando.fabricante || ''} onChange={e => setEditando({ ...editando, fabricante: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Material</label>
                <input value={editando.material || ''} onChange={e => setEditando({ ...editando, material: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Color</label>
                <input value={editando.color || ''} onChange={e => setEditando({ ...editando, color: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Formato</label>
                <input value={editando.formato || ''} onChange={e => setEditando({ ...editando, formato: e.target.value })} className={inputClass} /></div>
              <div><label className="text-[11px] text-text3">Stock mínimo</label>
                <input type="number" step="0.001" value={editando.stock_minimo ?? ''} onChange={e => setEditando({ ...editando, stock_minimo: e.target.value })} className={inputClass} /></div>
              <div className="col-span-2"><label className="text-[11px] text-text3">Notas</label>
                <input value={editando.notas || ''} onChange={e => setEditando({ ...editando, notas: e.target.value })} className={inputClass} /></div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={guardarEdicion} className="text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
                Guardar
              </button>
              <button onClick={() => setEditando(null)} className="text-[12.5px] border border-border rounded-md px-4 py-2 text-text2 hover:bg-bg-app">
                Cancelar
              </button>
            </div>
            {editStatus && <div className="text-[11.5px] text-red-600 mt-2">{editStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
