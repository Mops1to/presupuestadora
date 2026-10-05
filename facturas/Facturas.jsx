import { useEffect, useState, Fragment } from 'react';
import { api } from '../../core/api';

const CATEGORIAS_FACTURA = {
  material: 'Material (stock)',
  gasto_fijo: 'Gasto fijo',
  mantenimiento_reparaciones: 'Mantenimiento y reparaciones',
  inmovilizado: 'Bien de inversión',
  marketing_publicidad: 'Marketing y publicidad',
  suministros_taller_oficina: 'Suministros taller/oficina',
  servicios_profesionales: 'Servicios profesionales',
  otro: 'Otro / sin clasificar',
};

const ESTADOS_FACTURA = {
  pendiente: 'Pendiente',
  revision_critica: 'Revisión crítica',
  aplicada: 'Aplicada',
  revisada: 'Revisada',
};

const ESTADOS_LINEA = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada → stock',
  aceptada_sin_stock: 'Aceptada (sin stock)',
};

const ESTADO_COLOR = {
  pendiente: 'bg-amber-100 text-amber-700',
  revision_critica: 'bg-red-100 text-red-600',
  aplicada: 'bg-emerald-100 text-emerald-700',
  revisada: 'bg-emerald-100 text-emerald-700',
};

const SUBCATEGORIAS_GASTO_FIJO = {
  alquiler_nave: 'Alquiler nave',
  electricidad: 'Electricidad',
  cuota_autonomos: 'Cuota autónomos',
  reparaciones: 'Reparaciones',
  inversiones: 'Inversiones',
};

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

export default function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [detalle, setDetalle] = useState(null); // { factura, lineas }
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState('revision'); // 'revision' | 'declarando'
  const [soloPendientesDeclarar, setSoloPendientesDeclarar] = useState(true);
  const [buscarDeclarando, setBuscarDeclarando] = useState('');

  // formulario de completar datos (cuando la factura está en revisión crítica)
  const [form, setForm] = useState({});
  // formulario de "convertir en bien de inversión"
  const [mostrarInversion, setMostrarInversion] = useState(false);
  const [anios, setAnios] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('otro');
  const [categoriaGastoSel, setCategoriaGastoSel] = useState('');
  // línea de factura que se está clasificando a mano (la IA no encontró
  // una referencia de stock parecida) — id, o null si ninguna está abierta
  const [clasificando, setClasificando] = useState(null);
  const [formClasificar, setFormClasificar] = useState({ fabricante: '', material: '', color: '', formato: '' });

  async function cargar() {
    const params = new URLSearchParams();
    if (filtroEstado) params.append('estado', filtroEstado);
    const data = await api('/facturas?' + params.toString());
    setFacturas(filtroTipo ? data.filter(f => f.tipo === filtroTipo) : data);
  }

  useEffect(() => { cargar(); }, [filtroEstado, filtroTipo]);

  async function abrirFactura(id) {
    const data = await api(`/facturas/${id}`);
    setDetalle(data);
    setForm({
      proveedor_nif: data.factura.proveedor_nif || '',
      proveedor_direccion: data.factura.proveedor_direccion || '',
      numero_factura: data.factura.numero_factura || '',
      importe_total: data.factura.importe_total || '',
    });
    setMostrarInversion(false);
    setAnios('');
    setCategoriaSel(data.factura.tipo || 'otro');
    setCategoriaGastoSel(data.factura.categoria_gasto || '');
  }

  async function guardarDatosCompletados() {
    try {
      await api(`/facturas/${detalle.factura.id}/completar-datos`, { method: 'PATCH', body: JSON.stringify(form) });
      setStatus('✓ Datos actualizados');
      abrirFactura(detalle.factura.id);
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function aceptarLinea(lineaId, payload = {}) {
    try {
      await api(`/facturas/lineas/${lineaId}/aceptar`, { method: 'POST', body: JSON.stringify(payload) });
      setClasificando(null);
      abrirFactura(detalle.factura.id);
    } catch (e) { alert('Error al aceptar la línea: ' + e.message); }
  }

  function abrirClasificacion(linea) {
    setClasificando(linea.id);
    setFormClasificar({
      fabricante: linea.fabricante_sugerido || '', material: linea.material_sugerido || '',
      color: linea.color_sugerido || '', formato: linea.formato_sugerido || '',
    });
  }

  async function crearBienInversion() {
    if (!anios) { setStatus('Pon los años de amortización'); return; }
    try {
      await api('/bienes-inversion', {
        method: 'POST',
        body: JSON.stringify({
          descripcion: `${detalle.factura.proveedor_nombre || 'Compra'} — ${(detalle.factura.archivo || '').split('/').pop()}`,
          importe: detalle.factura.importe_total,
          fecha_alta: (detalle.factura.fecha || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          anios_amortizacion: parseFloat(anios),
          factura_id: detalle.factura.id,
        }),
      });
      setStatus('✓ Bien de inversión creado — ya puedes verlo en esa sección');
      abrirFactura(detalle.factura.id);
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function marcarRevisada() {
    try {
      await api(`/facturas/${detalle.factura.id}/marcar-revisada`, { method: 'PATCH' });
      setStatus('✓ Marcada como revisada');
      abrirFactura(detalle.factura.id);
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function toggleDeclarado(facturaId, declarado) {
    try {
      await api(`/facturas/${facturaId}/declarado`, { method: 'PATCH', body: JSON.stringify({ declarado }) });
      cargar();
      if (detalle?.factura.id === facturaId) {
        setDetalle(d => ({ ...d, factura: { ...d.factura, declarado_en_gestoria: declarado ? 1 : 0 } }));
      }
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function guardarCategoria() {
    if (categoriaSel === 'gasto_fijo' && !categoriaGastoSel) {
      setStatus('Elige a qué tipo de gasto fijo corresponde'); return;
    }
    try {
      await api(`/facturas/${detalle.factura.id}/categoria`, {
        method: 'PATCH',
        body: JSON.stringify({ tipo: categoriaSel, categoria_gasto: categoriaSel === 'gasto_fijo' ? categoriaGastoSel : null }),
      });
      setStatus('✓ Categoría actualizada');
      abrirFactura(detalle.factura.id);
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  const bajoRevision = detalle?.factura.estado === 'revision_critica';

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-4">Facturas</h1>

      <div className="flex gap-1 mb-4 border-b border-border">
        {[['revision', 'Revisión'], ['declarando', 'Para Declarando']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3.5 py-2 text-[12.5px] font-semibold border-b-2 -mb-px ${tab === id ? 'border-ink text-ink' : 'border-transparent text-text3 hover:text-text2'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'revision' && (
      <>
      <div className="flex gap-2 mb-4">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_FACTURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS_FACTURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden mb-4">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="font-semibold">Proveedor</th>
              <th className="font-semibold">Categoría</th>
              <th className="font-semibold">Importe</th>
              <th className="font-semibold">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {facturas.map(f => (
              <tr key={f.id} className="border-b border-border/60 hover:bg-bg-app cursor-pointer" onClick={() => abrirFactura(f.id)}>
                <td className="px-3 py-2 text-text3">{(f.fecha || '').slice(0, 10)}</td>
                <td>{f.proveedor_nombre || '(sin proveedor)'}</td>
                <td>{CATEGORIAS_FACTURA[f.tipo] || f.tipo}</td>
                <td className="font-mono">{f.importe_total != null ? `${f.importe_total}€` : '—'}</td>
                <td><span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold ${ESTADO_COLOR[f.estado] || ''}`}>{ESTADOS_FACTURA[f.estado] || f.estado}</span></td>
                <td className="pr-3 text-ink text-[11.5px]">Ver →</td>
              </tr>
            ))}
            {facturas.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-6">Sin facturas con estos filtros</td></tr>}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-xl w-[560px] max-h-[88vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-1">
              <h3 className="text-base font-semibold text-text">{detalle.factura.proveedor_nombre || '(sin proveedor)'}</h3>
              <button onClick={() => setDetalle(null)} className="text-text3 hover:text-text text-[13px]">✕</button>
            </div>
            <div className="text-[12px] text-text3 mb-1">
              {(detalle.factura.fecha || '').slice(0, 10)} ·
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold ${ESTADO_COLOR[detalle.factura.estado]}`}>{ESTADOS_FACTURA[detalle.factura.estado]}</span>
            </div>

            {detalle.factura.estado === 'aplicada' ? (
              <div className="text-[12px] text-text3 mb-4">
                Categoría: {CATEGORIAS_FACTURA[detalle.factura.tipo] || detalle.factura.tipo}
                <span className="text-text3/70"> (ya aplicada a costes fijos — para cambiarla, réstala a mano en Amortización primero)</span>
              </div>
            ) : (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] text-text3">Categoría</label>
                  <select value={categoriaSel} onChange={e => setCategoriaSel(e.target.value)} className={inputClass + ' bg-white'}>
                    {Object.entries(CATEGORIAS_FACTURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {categoriaSel === 'gasto_fijo' && (
                  <div className="flex-1">
                    <label className="text-[11px] text-text3">Tipo de gasto fijo</label>
                    <select value={categoriaGastoSel} onChange={e => setCategoriaGastoSel(e.target.value)} className={inputClass + ' bg-white'}>
                      <option value="">— selecciona —</option>
                      {Object.entries(SUBCATEGORIAS_GASTO_FIJO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={guardarCategoria} className="text-[12px] font-semibold border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app whitespace-nowrap">
                  Guardar categoría
                </button>
              </div>
            )}

            {detalle.factura.alerta_fiscal && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-[12px] text-amber-800 mb-3">
                ⚠ {detalle.factura.alerta_fiscal}
              </div>
            )}
            {detalle.factura.motivo_revision && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-[12px] text-red-700 mb-3">
                {detalle.factura.motivo_revision}
              </div>
            )}

            {bajoRevision && (
              <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
                <div className="text-[12px] font-semibold text-text mb-2">Completa los datos que faltan</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div><label className="text-[11px] text-text3">NIF proveedor</label>
                    <input value={form.proveedor_nif} onChange={e => setForm({ ...form, proveedor_nif: e.target.value })} className={inputClass} /></div>
                  <div><label className="text-[11px] text-text3">Nº factura</label>
                    <input value={form.numero_factura} onChange={e => setForm({ ...form, numero_factura: e.target.value })} className={inputClass} /></div>
                  <div className="col-span-2"><label className="text-[11px] text-text3">Dirección proveedor</label>
                    <input value={form.proveedor_direccion} onChange={e => setForm({ ...form, proveedor_direccion: e.target.value })} className={inputClass} /></div>
                  <div><label className="text-[11px] text-text3">Importe total (€)</label>
                    <input type="number" step="0.01" value={form.importe_total} onChange={e => setForm({ ...form, importe_total: e.target.value })} className={inputClass} /></div>
                </div>
                <button onClick={guardarDatosCompletados} className="mt-2.5 text-[12px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-3.5 py-1.5">
                  Guardar datos
                </button>
              </div>
            )}

            {detalle.factura.tipo === 'inmovilizado' && (
              <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
                <div className="text-[12px] font-semibold text-text mb-1">Bien de inversión</div>
                <p className="text-[11.5px] text-text3 mb-2">Esta factura se marcó como inmovilizado — decide en cuántos años se amortiza.</p>
                <div className="flex gap-2">
                  <input type="number" step="0.5" placeholder="Años" value={anios} onChange={e => setAnios(e.target.value)} className="w-24 text-[12.5px] border border-border rounded-md px-2.5 py-1.5" />
                  <button onClick={crearBienInversion} className="text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3.5 py-1.5">
                    Dar de alta como bien de inversión
                  </button>
                </div>
              </div>
            )}

            {detalle.factura.estado === 'pendiente' && detalle.lineas.length === 0 && detalle.factura.tipo !== 'inmovilizado' && (
              <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
                <p className="text-[11.5px] text-text3 mb-2">
                  Esta categoría no genera líneas de stock — solo queda confirmar que ya la has revisado.
                </p>
                <button onClick={marcarRevisada} className="text-[12px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-3.5 py-1.5">
                  Marcar como revisada
                </button>
              </div>
            )}

            {detalle.lineas.length > 0 && (
              <>
                <div className="text-[12px] font-semibold text-text mb-2">Líneas</div>
                <table className="w-full text-[12px] mb-3">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                      <th className="pb-1.5 font-semibold">Descripción</th><th className="font-semibold">Importe</th><th className="font-semibold">Estado</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.lineas.map(l => (
                      <Fragment key={l.id}>
                        <tr className="border-b border-border/60">
                          <td className="py-1.5">{l.descripcion_original}</td>
                          <td className="font-mono">{l.importe}€</td>
                          <td>{ESTADOS_LINEA[l.estado] || l.estado}</td>
                          <td className="whitespace-nowrap">
                            {l.estado === 'pendiente' && (
                              l.referencia_id_sugerida ? (
                                // La IA encontró una referencia de stock que ya conocemos: directo.
                                <button onClick={() => aceptarLinea(l.id)} className="text-[11px] border border-border rounded px-2 py-1 text-text2 hover:bg-bg-app mr-1.5">
                                  Aceptar → stock
                                </button>
                              ) : (
                                // La IA no está segura de qué referencia es: hay que confirmarla a mano.
                                <button onClick={() => abrirClasificacion(l)} className="text-[11px] border border-amber-300 bg-amber-50 rounded px-2 py-1 text-amber-800 hover:bg-amber-100 mr-1.5">
                                  Clasificar y aceptar
                                </button>
                              )
                            )}
                            {l.estado === 'pendiente' && (
                              <button onClick={() => aceptarLinea(l.id, { no_incluir_stock: true })} className="text-[11px] text-text3 hover:text-text2 underline decoration-dotted">
                                No es material
                              </button>
                            )}
                          </td>
                        </tr>
                        {clasificando === l.id && (
                          <tr className="bg-amber-50/60">
                            <td colSpan={4} className="p-3">
                              <div className="grid grid-cols-4 gap-2 mb-2">
                                <div><label className="text-[10.5px] text-text3">Fabricante</label>
                                  <input value={formClasificar.fabricante} onChange={e => setFormClasificar({ ...formClasificar, fabricante: e.target.value })} className={inputClass} /></div>
                                <div><label className="text-[10.5px] text-text3">Material</label>
                                  <input value={formClasificar.material} onChange={e => setFormClasificar({ ...formClasificar, material: e.target.value })} className={inputClass} /></div>
                                <div><label className="text-[10.5px] text-text3">Color</label>
                                  <input value={formClasificar.color} onChange={e => setFormClasificar({ ...formClasificar, color: e.target.value })} className={inputClass} /></div>
                                <div><label className="text-[10.5px] text-text3">Formato</label>
                                  <input value={formClasificar.formato} onChange={e => setFormClasificar({ ...formClasificar, formato: e.target.value })} className={inputClass} /></div>
                              </div>
                              <button onClick={() => aceptarLinea(l.id, formClasificar)} className="text-[11.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-3 py-1.5 mr-2">
                                Confirmar y aceptar
                              </button>
                              <button onClick={() => setClasificando(null)} className="text-[11.5px] text-text3 hover:text-text2">
                                Cancelar
                              </button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
          </div>
        </div>
      )}
      </>
      )}

      {tab === 'declarando' && (
        <div>
          <p className="text-[13px] text-text3 mb-3">
            Solo lo que necesitas para meterlo en Declarando: número de factura, importe, y si ya lo has subido o no.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <input value={buscarDeclarando} onChange={e => setBuscarDeclarando(e.target.value)} placeholder="Buscar por proveedor o número de factura..."
              className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 w-72" />
            <label className="flex items-center gap-1.5 text-[11.5px] text-text2 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={soloPendientesDeclarar} onChange={e => setSoloPendientesDeclarar(e.target.checked)} className="accent-ink" />
              Solo pendientes de declarar
            </label>
          </div>

          {(() => {
            let lista = facturas.filter(f => f.numero_factura);
            if (soloPendientesDeclarar) lista = lista.filter(f => !f.declarado_en_gestoria);
            if (buscarDeclarando.trim()) {
              const q = buscarDeclarando.trim().toLowerCase();
              lista = lista.filter(f => [f.proveedor_nombre, f.numero_factura].filter(Boolean).some(c => c.toLowerCase().includes(q)));
            }
            const totalPendiente = facturas.filter(f => f.numero_factura && !f.declarado_en_gestoria)
              .reduce((sum, f) => sum + (f.importe_total || 0), 0);
            return (
              <>
                <div className="text-[12px] text-text3 mb-2">
                  {facturas.filter(f => f.numero_factura && !f.declarado_en_gestoria).length} facturas pendientes de declarar · {totalPendiente.toFixed(2)}€ en total
                </div>
                <div className="bg-white border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="font-semibold">Proveedor</th>
                        <th className="font-semibold">Nº factura</th>
                        <th className="font-semibold">Importe</th>
                        <th className="font-semibold text-center">Declarando</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(f => (
                        <tr key={f.id} className="border-b border-border/60">
                          <td className="px-3 py-2 text-text3">{(f.fecha || '').slice(0, 10)}</td>
                          <td>{f.proveedor_nombre || '(sin proveedor)'}</td>
                          <td className="font-mono">{f.numero_factura}</td>
                          <td className="font-mono">{(f.importe_total || 0).toFixed(2)}€</td>
                          <td className="text-center">
                            <input type="checkbox" checked={!!f.declarado_en_gestoria}
                              onChange={e => toggleDeclarado(f.id, e.target.checked)} className="accent-ink" />
                          </td>
                        </tr>
                      ))}
                      {lista.length === 0 && <tr><td colSpan={5} className="text-center text-text3 py-6">Nada pendiente con estos filtros</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
