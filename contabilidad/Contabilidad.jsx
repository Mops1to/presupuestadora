import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../../core/api';

const COLORES = ['#075279', '#1c8fc4', '#f59e0b', '#e74c3c', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

const ESTADOS_COBRO = { cobrado: 'Cobrado', pendiente: 'Pendiente' };

function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-');
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${nombres[parseInt(mes, 10) - 1]} ${anio.slice(2)}`;
}

export default function Contabilidad() {
  const [tab, setTab] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [ingresos, setIngresos] = useState([]);
  const [movimientosCapital, setMovimientosCapital] = useState([]);
  const [nuevoMov, setNuevoMov] = useState({ tipo: 'aportacion', socio: '', importe: '', fecha: '', notas: '' });
  const [statusCapital, setStatusCapital] = useState('');

  function cargarCapital() {
    api('/contabilidad/movimientos-capital').then(setMovimientosCapital).catch(() => {});
  }

  useEffect(() => {
    api('/contabilidad/resumen').then(setResumen).catch(() => {});
    api('/contabilidad/ingresos').then(setIngresos).catch(() => {});
    cargarCapital();
  }, []);

  async function crearMovimientoCapital() {
    if (!nuevoMov.importe || !nuevoMov.fecha) { setStatusCapital('Faltan importe y/o fecha'); return; }
    try {
      await api('/contabilidad/movimientos-capital', {
        method: 'POST',
        body: JSON.stringify({ ...nuevoMov, importe: parseFloat(nuevoMov.importe) }),
      });
      setStatusCapital('✓ Registrado');
      setNuevoMov({ tipo: nuevoMov.tipo, socio: nuevoMov.socio, importe: '', fecha: '', notas: '' });
      cargarCapital();
    } catch (e) { setStatusCapital('Error: ' + e.message); }
  }

  async function borrarMovimientoCapital(id) {
    await api(`/contabilidad/movimientos-capital/${id}`, { method: 'DELETE' });
    cargarCapital();
  }

  const datosMeses = resumen?.meses.map(m => ({ ...m, mesLabel: etiquetaMes(m.mes) })) || [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Contabilidad</h1>
      <p className="text-[13px] text-text3 mb-4">
        Lo que ya recoge sola el resto de la app, en un solo sitio — no sustituye a Declarando, es para ver de un vistazo cómo va el negocio.
      </p>

      <div className="flex gap-1 mb-4 border-b border-border">
        {[['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['gastos', 'Gastos'], ['capital', 'Aportaciones y retiradas']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3.5 py-2 text-[12.5px] font-semibold border-b-2 -mb-px ${tab === id ? 'border-ink text-ink' : 'border-transparent text-text3 hover:text-text2'}`}>
            {label}
          </button>
        ))}
      </div>

      {!resumen ? (
        <div className="text-text3 text-sm">Cargando...</div>
      ) : tab === 'resumen' ? (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-border rounded-lg p-3.5">
              <div className="text-[10.5px] text-text3 uppercase mb-1">Este mes</div>
              <div className="flex justify-between text-[12px]">
                <span className="text-emerald-600">Facturado <b className="font-mono">{resumen.mes_actual.ingresos.toFixed(2)}€</b></span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-red-600">Gastado <b className="font-mono">{resumen.mes_actual.gastos.toFixed(2)}€</b></span>
              </div>
              <div className="flex justify-between text-[13px] mt-1 pt-1 border-t border-border">
                <span className="font-semibold">Margen</span>
                <b className={`font-mono ${resumen.mes_actual.margen >= 0 ? 'text-ink' : 'text-red-600'}`}>{resumen.mes_actual.margen.toFixed(2)}€</b>
              </div>
            </div>
            <div className="bg-white border border-border rounded-lg p-3.5">
              <div className="text-[10.5px] text-text3 uppercase mb-1">Este año</div>
              <div className="flex justify-between text-[12px]">
                <span className="text-emerald-600">Facturado <b className="font-mono">{resumen.ano_actual.ingresos.toFixed(2)}€</b></span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-red-600">Gastado <b className="font-mono">{resumen.ano_actual.gastos.toFixed(2)}€</b></span>
              </div>
              <div className="flex justify-between text-[13px] mt-1 pt-1 border-t border-border">
                <span className="font-semibold">Margen</span>
                <b className={`font-mono ${resumen.ano_actual.margen >= 0 ? 'text-ink' : 'text-red-600'}`}>{resumen.ano_actual.margen.toFixed(2)}€</b>
              </div>
            </div>
            <div className="bg-ink-soft border border-border rounded-lg p-3.5 flex flex-col justify-center items-center">
              <div className="text-[10.5px] text-ink uppercase">Margen del año</div>
              <div className={`font-mono font-bold text-2xl ${resumen.ano_actual.margen >= 0 ? 'text-ink' : 'text-red-600'}`}>
                {resumen.ano_actual.margen.toFixed(0)}€
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl p-4 mb-4">
            <h2 className="text-[13px] font-semibold text-text mb-3">Ingresos vs. gastos — últimos 12 meses</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={datosMeses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EF" />
                <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `${v.toFixed ? v.toFixed(2) : v}€`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#e74c3c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-xl p-4">
              <h2 className="text-[13px] font-semibold text-text mb-3">Gasto por categoría</h2>
              {resumen.gasto_por_categoria.length === 0 ? (
                <p className="text-[12px] text-text3">Sin gastos registrados todavía.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={resumen.gasto_por_categoria} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={80}
                      label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                      {resumen.gasto_por_categoria.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => `${v.toFixed(2)}€`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <h2 className="text-[13px] font-semibold text-text mb-3">Evolución del margen</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={datosMeses.map(m => ({ ...m, margen: m.ingresos - m.gastos }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EF" />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => `${v.toFixed(2)}€`} />
                  <Line type="monotone" dataKey="margen" stroke="#075279" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : tab === 'ingresos' ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
                <th className="px-3 py-2 font-semibold">Fecha</th><th className="font-semibold">Proyecto</th>
                <th className="font-semibold">Nº factura</th><th className="font-semibold">Importe</th><th className="font-semibold">Cobro</th>
              </tr>
            </thead>
            <tbody>
              {ingresos.map(f => (
                <tr key={f.id} className="border-b border-border/60">
                  <td className="px-3 py-2 text-text3">{(f.fecha || '').slice(0, 10)}</td>
                  <td>{f.proyecto_codigo} — {f.proyecto_nombre}</td>
                  <td className="font-mono">{f.numero || '—'}</td>
                  <td className="font-mono">{(f.importe || 0).toFixed(2)}€</td>
                  <td>{ESTADOS_COBRO[f.estado_cobro] || f.estado_cobro || '—'}</td>
                </tr>
              ))}
              {ingresos.length === 0 && <tr><td colSpan={5} className="text-center text-text3 py-6">Sin facturas a clientes todavía</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-border rounded-xl p-4">
            <h2 className="text-[13px] font-semibold text-text mb-3">Por categoría</h2>
            <table className="w-full text-[12.5px]">
              <tbody>
                {resumen.gasto_por_categoria.map(c => (
                  <tr key={c.categoria} className="border-b border-border/60">
                    <td className="py-1.5">{c.label}</td>
                    <td className="text-right font-mono">{c.total.toFixed(2)}€</td>
                  </tr>
                ))}
                {resumen.gasto_por_categoria.length === 0 && <tr><td className="text-text3 py-3">Sin gastos todavía</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <h2 className="text-[13px] font-semibold text-text mb-3">Por proveedor (top 8)</h2>
            <table className="w-full text-[12.5px]">
              <tbody>
                {resumen.gasto_por_proveedor.map(p => (
                  <tr key={p.proveedor} className="border-b border-border/60">
                    <td className="py-1.5">{p.proveedor}</td>
                    <td className="text-right font-mono">{p.total.toFixed(2)}€</td>
                  </tr>
                ))}
                {resumen.gasto_por_proveedor.length === 0 && <tr><td className="text-text3 py-3">Sin gastos todavía</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'capital' && (() => {
        const porSocio = {};
        for (const m of movimientosCapital) {
          const clave = m.socio || '(sin especificar)';
          if (!porSocio[clave]) porSocio[clave] = { aportado: 0, retirado: 0 };
          if (m.tipo === 'aportacion') porSocio[clave].aportado += m.importe;
          else porSocio[clave].retirado += m.importe;
        }
        return (
          <div>
            <p className="text-[13px] text-text3 mb-3">
              Dinero que entra o sale de la empresa fuera de la facturación normal — un socio mete dinero propio para cubrir un bache, o retira parte del suyo.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {Object.keys(porSocio).length === 0 && (
                <div className="text-[12px] text-text3 col-span-3">Sin movimientos todavía.</div>
              )}
              {Object.entries(porSocio).map(([socio, t]) => (
                <div key={socio} className="bg-white border border-border rounded-lg p-3.5">
                  <div className="text-[10.5px] text-text3 uppercase mb-1">{socio}</div>
                  <div className="flex justify-between text-[12px]"><span className="text-emerald-600">Aportado</span><b className="font-mono">{t.aportado.toFixed(2)}€</b></div>
                  <div className="flex justify-between text-[12px]"><span className="text-red-600">Retirado</span><b className="font-mono">{t.retirado.toFixed(2)}€</b></div>
                  <div className="flex justify-between text-[13px] mt-1 pt-1 border-t border-border"><span className="font-semibold">Saldo</span><b className="font-mono">{(t.aportado - t.retirado).toFixed(2)}€</b></div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <h2 className="text-[13px] font-semibold text-text mb-3">Registrar movimiento</h2>
              <div className="grid grid-cols-4 gap-2.5 mb-3">
                <div>
                  <label className="text-[11px] text-text3">Tipo</label>
                  <select value={nuevoMov.tipo} onChange={e => setNuevoMov({ ...nuevoMov, tipo: e.target.value })} className={inputClass + ' bg-white'}>
                    <option value="aportacion">Aportación (entra)</option>
                    <option value="retirada">Retirada (sale)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-text3">Socio</label>
                  <input value={nuevoMov.socio} onChange={e => setNuevoMov({ ...nuevoMov, socio: e.target.value })} placeholder="Christian, Santi..." className={inputClass} />
                </div>
                <div>
                  <label className="text-[11px] text-text3">Importe (€)</label>
                  <input type="number" step="0.01" value={nuevoMov.importe} onChange={e => setNuevoMov({ ...nuevoMov, importe: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-[11px] text-text3">Fecha</label>
                  <input type="date" value={nuevoMov.fecha} onChange={e => setNuevoMov({ ...nuevoMov, fecha: e.target.value })} className={inputClass} />
                </div>
                <div className="col-span-4">
                  <label className="text-[11px] text-text3">Notas</label>
                  <input value={nuevoMov.notas} onChange={e => setNuevoMov({ ...nuevoMov, notas: e.target.value })} className={inputClass} />
                </div>
              </div>
              <button onClick={crearMovimientoCapital} className="text-[12.5px] font-semibold bg-ink hover:bg-ink-light text-white rounded-md px-4 py-2">
                Registrar
              </button>
              {statusCapital && <div className="text-[11.5px] text-text2 mt-2">{statusCapital}</div>}

              <table className="w-full text-[12.5px] mt-5">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border">
                    <th className="pb-1.5 font-semibold">Fecha</th><th className="font-semibold">Tipo</th>
                    <th className="font-semibold">Socio</th><th className="font-semibold">Notas</th>
                    <th className="font-semibold">Importe</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosCapital.map(m => (
                    <tr key={m.id} className="border-b border-border/60">
                      <td className="py-1.5 text-text3">{(m.fecha || '').slice(0, 10)}</td>
                      <td className={m.tipo === 'aportacion' ? 'text-emerald-600' : 'text-red-600'}>{m.tipo === 'aportacion' ? 'Aportación' : 'Retirada'}</td>
                      <td>{m.socio || '—'}</td>
                      <td className="text-text3">{m.notas || ''}</td>
                      <td className="font-mono">{m.importe.toFixed(2)}€</td>
                      <td><button onClick={() => borrarMovimientoCapital(m.id)} className="text-text3 hover:text-red-500">✕</button></td>
                    </tr>
                  ))}
                  {movimientosCapital.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-4">Sin movimientos todavía</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
