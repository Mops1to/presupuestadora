import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload, FileText } from 'lucide-react';
import { api, apiUpload, API_BASE } from '../../core/api';

const CATEGORIAS_GASTO = {
  seguro: 'Seguro', comunidad: 'Comunidad', reparacion: 'Reparación',
  mobiliario: 'Mobiliario', reforma: 'Reforma', suministros: 'Suministros', otro: 'Otro',
};

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

export default function MiPiso() {
  const [tab, setTab] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [inquilinos, setInquilinos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [status, setStatus] = useState('');
  const fileInputs = useRef({});

  const [mostrarNuevoInquilino, setMostrarNuevoInquilino] = useState(false);
  const [nuevoInquilino, setNuevoInquilino] = useState({ nombre: '', habitacion: '', telefono: '', email: '', renta_mensual: '', fecha_entrada: '', notas: '' });

  const [nuevoMov, setNuevoMov] = useState({ tipo: 'ingreso', categoria: '', descripcion: '', importe: '', fecha: '', inquilino_id: '' });

  async function cargarTodo() {
    const [r, i, m] = await Promise.all([api('/piso/resumen'), api('/piso/inquilinos'), api('/piso/movimientos')]);
    setResumen(r); setInquilinos(i); setMovimientos(m);
  }

  useEffect(() => { cargarTodo(); }, []);

  async function crearInquilino() {
    if (!nuevoInquilino.nombre) { setStatus('Falta el nombre'); return; }
    try {
      await api('/piso/inquilinos', {
        method: 'POST',
        body: JSON.stringify({ ...nuevoInquilino, renta_mensual: parseFloat(nuevoInquilino.renta_mensual) || null }),
      });
      setStatus('✓ Inquilino añadido');
      setNuevoInquilino({ nombre: '', habitacion: '', telefono: '', email: '', renta_mensual: '', fecha_entrada: '', notas: '' });
      setMostrarNuevoInquilino(false);
      cargarTodo();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function borrarInquilino(id) {
    if (!confirm('¿Borrar este inquilino? (no borra sus movimientos ya registrados)')) return;
    await api(`/piso/inquilinos/${id}`, { method: 'DELETE' });
    cargarTodo();
  }

  async function subirContrato(inquilinoId, file) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiUpload(`/piso/inquilinos/${inquilinoId}/contrato`, fd);
      setStatus('✓ Contrato subido');
      cargarTodo();
    } catch (e) { setStatus('Error subiendo el contrato: ' + e.message); }
  }

  function verContrato(inquilinoId) {
    window.open(`${API_BASE}/piso/inquilinos/${inquilinoId}/contrato`, '_blank');
  }

  async function crearMovimiento() {
    if (!nuevoMov.importe || !nuevoMov.fecha) { setStatus('Faltan importe y/o fecha'); return; }
    try {
      await api('/piso/movimientos', {
        method: 'POST',
        body: JSON.stringify({ ...nuevoMov, importe: parseFloat(nuevoMov.importe), inquilino_id: nuevoMov.inquilino_id || null }),
      });
      setStatus('✓ Movimiento registrado');
      setNuevoMov({ tipo: nuevoMov.tipo, categoria: '', descripcion: '', importe: '', fecha: '', inquilino_id: '' });
      cargarTodo();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function borrarMovimiento(id) {
    await api(`/piso/movimientos/${id}`, { method: 'DELETE' });
    cargarTodo();
  }

  const nombreInquilino = (id) => inquilinos.find(i => i.id === id)?.nombre || '';

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Mi Piso</h1>
      <p className="text-[13px] text-text3 mb-4">Zona privada — solo tú la ves.</p>

      <div className="flex gap-1 mb-4 border-b border-border">
        {[['resumen', 'Resumen'], ['inquilinos', 'Inquilinos'], ['movimientos', 'Ingresos y gastos']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3.5 py-2 text-[12.5px] font-semibold border-b-2 -mb-px ${tab === id ? 'border-ink text-ink' : 'border-transparent text-text3 hover:text-text2'}`}>
            {label}
          </button>
        ))}
      </div>

      {status && <div className="text-[12px] text-text2 mb-3">{status}</div>}

      {tab === 'resumen' && resumen && (
        <div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3.5">
              <div className="text-[10.5px] text-emerald-700 uppercase">Ingresos</div>
              <div className="font-mono font-bold text-lg text-emerald-700">{resumen.ingresos.toFixed(2)}€</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3.5">
              <div className="text-[10.5px] text-red-600 uppercase">Gastos</div>
              <div className="font-mono font-bold text-lg text-red-600">{resumen.gastos.toFixed(2)}€</div>
            </div>
            <div className="bg-white border border-border rounded-lg p-3.5">
              <div className="text-[10.5px] text-text3 uppercase">Balance</div>
              <div className={`font-mono font-bold text-lg ${resumen.balance >= 0 ? 'text-ink' : 'text-red-600'}`}>{resumen.balance.toFixed(2)}€</div>
            </div>
            <div className="bg-white border border-border rounded-lg p-3.5">
              <div className="text-[10.5px] text-text3 uppercase">Inquilinos activos</div>
              <div className="font-mono font-bold text-lg text-text">{resumen.inquilinos_activos}</div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl p-4">
            <h2 className="text-[13px] font-semibold text-text mb-3">Gastos por categoría</h2>
            {resumen.por_categoria.length === 0 && <p className="text-[12px] text-text3">Sin gastos registrados todavía.</p>}
            {resumen.por_categoria.map(c => (
              <div key={c.categoria} className="flex justify-between text-[12.5px] py-1 border-b border-border/60 last:border-0">
                <span>{CATEGORIAS_GASTO[c.categoria] || c.categoria}</span>
                <span className="font-mono">{c.total.toFixed(2)}€</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'inquilinos' && (
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[13px] font-semibold text-text">Inquilinos</h2>
            <button onClick={() => setMostrarNuevoInquilino(v => !v)} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
              {mostrarNuevoInquilino ? 'Cancelar' : '+ Nuevo inquilino'}
            </button>
          </div>

          {mostrarNuevoInquilino && (
            <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mb-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div><label className="text-[11px] text-text3">Nombre</label>
                  <input value={nuevoInquilino.nombre} onChange={e => setNuevoInquilino({ ...nuevoInquilino, nombre: e.target.value })} className={inputClass} /></div>
                <div><label className="text-[11px] text-text3">Habitación</label>
                  <input value={nuevoInquilino.habitacion} onChange={e => setNuevoInquilino({ ...nuevoInquilino, habitacion: e.target.value })} className={inputClass} /></div>
                <div><label className="text-[11px] text-text3">Renta mensual (€)</label>
                  <input type="number" value={nuevoInquilino.renta_mensual} onChange={e => setNuevoInquilino({ ...nuevoInquilino, renta_mensual: e.target.value })} className={inputClass} /></div>
                <div><label className="text-[11px] text-text3">Teléfono</label>
                  <input value={nuevoInquilino.telefono} onChange={e => setNuevoInquilino({ ...nuevoInquilino, telefono: e.target.value })} className={inputClass} /></div>
                <div><label className="text-[11px] text-text3">Email</label>
                  <input value={nuevoInquilino.email} onChange={e => setNuevoInquilino({ ...nuevoInquilino, email: e.target.value })} className={inputClass} /></div>
                <div><label className="text-[11px] text-text3">Fecha de entrada</label>
                  <input type="date" value={nuevoInquilino.fecha_entrada} onChange={e => setNuevoInquilino({ ...nuevoInquilino, fecha_entrada: e.target.value })} className={inputClass} /></div>
              </div>
              <button onClick={crearInquilino} className="mt-2.5 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3.5 py-1.5">
                Añadir
              </button>
            </div>
          )}

          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                <th className="pb-1.5 font-semibold">Nombre</th><th className="font-semibold">Habitación</th>
                <th className="font-semibold">Renta</th><th className="font-semibold">Entrada</th>
                <th className="font-semibold">Contrato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {inquilinos.map(i => (
                <tr key={i.id} className="border-b border-border/60">
                  <td className="py-1.5">{i.nombre}</td>
                  <td>{i.habitacion || '—'}</td>
                  <td className="font-mono">{i.renta_mensual ? `${i.renta_mensual}€/mes` : '—'}</td>
                  <td className="text-text3">{(i.fecha_entrada || '').slice(0, 10)}</td>
                  <td>
                    {i.contrato_archivo ? (
                      <button onClick={() => verContrato(i.id)} className="inline-flex items-center gap-1 text-ink hover:underline text-[11.5px]">
                        <FileText size={12} /> Ver
                      </button>
                    ) : (
                      <>
                        <input ref={el => fileInputs.current[i.id] = el} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                          onChange={e => e.target.files[0] && subirContrato(i.id, e.target.files[0])} />
                        <button onClick={() => fileInputs.current[i.id]?.click()} className="inline-flex items-center gap-1 text-text3 hover:text-ink text-[11.5px]">
                          <Upload size={12} /> Subir
                        </button>
                      </>
                    )}
                  </td>
                  <td><button onClick={() => borrarInquilino(i.id)} className="text-text3 hover:text-red-500"><Trash2 size={13} /></button></td>
                </tr>
              ))}
              {inquilinos.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-4">Sin inquilinos todavía</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'movimientos' && (
        <div className="bg-white border border-border rounded-xl p-4">
          <h2 className="text-[13px] font-semibold text-text mb-3">Registrar movimiento</h2>
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div>
              <label className="text-[11px] text-text3">Tipo</label>
              <select value={nuevoMov.tipo} onChange={e => setNuevoMov({ ...nuevoMov, tipo: e.target.value })} className={inputClass + ' bg-white'}>
                <option value="ingreso">Ingreso</option>
                <option value="gasto">Gasto</option>
              </select>
            </div>
            {nuevoMov.tipo === 'gasto' && (
              <div>
                <label className="text-[11px] text-text3">Categoría</label>
                <select value={nuevoMov.categoria} onChange={e => setNuevoMov({ ...nuevoMov, categoria: e.target.value })} className={inputClass + ' bg-white'}>
                  <option value="">— selecciona —</option>
                  {Object.entries(CATEGORIAS_GASTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            {nuevoMov.tipo === 'ingreso' && (
              <div>
                <label className="text-[11px] text-text3">Inquilino (opcional)</label>
                <select value={nuevoMov.inquilino_id} onChange={e => setNuevoMov({ ...nuevoMov, inquilino_id: e.target.value })} className={inputClass + ' bg-white'}>
                  <option value="">— sin especificar —</option>
                  {inquilinos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-[11px] text-text3">Importe (€)</label>
              <input type="number" step="0.01" value={nuevoMov.importe} onChange={e => setNuevoMov({ ...nuevoMov, importe: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] text-text3">Fecha</label>
              <input type="date" value={nuevoMov.fecha} onChange={e => setNuevoMov({ ...nuevoMov, fecha: e.target.value })} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-text3">Descripción</label>
              <input value={nuevoMov.descripcion} onChange={e => setNuevoMov({ ...nuevoMov, descripcion: e.target.value })} className={inputClass} />
            </div>
          </div>
          <button onClick={crearMovimiento} className="text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
            Registrar
          </button>

          <table className="w-full text-[12.5px] mt-5">
            <thead>
              <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                <th className="pb-1.5 font-semibold">Fecha</th><th className="font-semibold">Tipo</th>
                <th className="font-semibold">Categoría / Inquilino</th><th className="font-semibold">Descripción</th>
                <th className="font-semibold">Importe</th><th></th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="py-1.5 text-text3">{(m.fecha || '').slice(0, 10)}</td>
                  <td className={m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}>{m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</td>
                  <td>{m.inquilino_id ? nombreInquilino(m.inquilino_id) : (CATEGORIAS_GASTO[m.categoria] || m.categoria || '—')}</td>
                  <td>{m.descripcion || ''}</td>
                  <td className="font-mono">{m.importe.toFixed(2)}€</td>
                  <td><button onClick={() => borrarMovimiento(m.id)} className="text-text3 hover:text-red-500"><Trash2 size={13} /></button></td>
                </tr>
              ))}
              {movimientos.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-4">Sin movimientos todavía</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
