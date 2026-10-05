import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../../core/api';

const COLORES = ['#075279', '#1c8fc4', '#f59e0b', '#e74c3c', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

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

  useEffect(() => {
    api('/contabilidad/resumen').then(setResumen).catch(() => {});
    api('/contabilidad/ingresos').then(setIngresos).catch(() => {});
  }, []);

  const datosMeses = resumen?.meses.map(m => ({ ...m, mesLabel: etiquetaMes(m.mes) })) || [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Contabilidad</h1>
      <p className="text-[13px] text-text3 mb-4">
        Lo que ya recoge sola el resto de la app, en un solo sitio — no sustituye a Declarando, es para ver de un vistazo cómo va el negocio.
      </p>

      <div className="flex gap-1 mb-4 border-b border-border">
        {[['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['gastos', 'Gastos']].map(([id, label]) => (
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
      ) : tab === 'gastos' ? (
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
      ) : null}
    </div>
  );
}
