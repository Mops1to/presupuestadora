import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const ESTADOS_COBRO = { cobrado: 'Cobrado', pendiente: 'Pendiente' };

export default function FacturasEmitidas() {
  const [facturas, setFacturas] = useState([]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [status, setStatus] = useState('');

  async function cargar() {
    setFacturas(await api('/contabilidad/ingresos'));
  }

  useEffect(() => { cargar(); }, []);

  async function toggleCobrado(facturaId, cobrado) {
    try {
      await api(`/facturas-clientes/${facturaId}/cobrado`, { method: 'PATCH', body: JSON.stringify({ cobrado }) });
      cargar();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  const lista = soloPendientes ? facturas.filter(f => f.estado_cobro !== 'cobrado') : facturas;
  const totalPendiente = facturas.filter(f => f.estado_cobro !== 'cobrado').reduce((s, f) => s + (f.importe || 0), 0);

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Facturas emitidas</h1>
      <p className="text-[13px] text-text3 mb-4">
        Las que emites tú a clientes (las de Declarando) — se leen solas al soltarlas en Nextcloud, aparte del todo de las de proveedores.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-1.5 text-[11.5px] text-text2 cursor-pointer">
          <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} className="accent-ink" />
          Solo pendientes de cobro
        </label>
        <span className="text-[12px] text-text3">{facturas.filter(f => f.estado_cobro !== 'cobrado').length} pendientes · {totalPendiente.toFixed(2)}€ en total</span>
      </div>

      {status && <div className="text-[11.5px] text-red-600 mb-2">{status}</div>}

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="font-semibold">Cliente</th>
              <th className="font-semibold">Nº factura</th>
              <th className="font-semibold">Vencimiento</th>
              <th className="font-semibold">Importe</th>
              <th className="font-semibold text-center">Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.id} className="border-b border-border/60">
                <td className="px-3 py-2 text-text3">{(f.fecha || '').slice(0, 10)}</td>
                <td>{f.cliente_final || f.proyecto_nombre || '(sin cliente)'}</td>
                <td className="font-mono">{f.numero || '—'}</td>
                <td className="text-text3">{(f.fecha_vencimiento || '').slice(0, 10) || '—'}</td>
                <td className="font-mono">{(f.importe || 0).toFixed(2)}€</td>
                <td className="text-center">
                  <input type="checkbox" checked={f.estado_cobro === 'cobrado'}
                    onChange={e => toggleCobrado(f.id, e.target.checked)} className="accent-ink" />
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-6">Sin facturas emitidas todavía</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
