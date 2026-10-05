import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { api } from '../../core/api';
import ProjectModal from '../tablero/ProjectModal';

const MARCAS = ['myrox_lab', 'myrox_print', 'myrox_works', 'myrox_automation', 'mw3d'];
const TIPOS = ['IR', 'D', 'DO', 'I3D', 'MD', 'FA'];
const ESTADO_LABELS = {
  presupuestado: 'Presupuestado', aceptado: 'Aceptado', en_curso: 'En curso',
  entregado: 'Entregado', facturado: 'Facturado', cobrado: 'Cobrado', rechazado: 'Rechazado',
};
const ESTADOS = Object.keys(ESTADO_LABELS);

const selectClass = 'text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white';

export default function Listado() {
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [modalProyecto, setModalProyecto] = useState(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroMarca) params.append('marca', filtroMarca);
    if (filtroTipo) params.append('tipo_trabajo', filtroTipo);
    if (filtroEstado) params.append('estado', filtroEstado);
    if (filtroCliente) params.append('cliente_id', filtroCliente);
    setProyectos(await api('/proyectos?' + params.toString()));
  }, [filtroMarca, filtroTipo, filtroEstado, filtroCliente]);

  useEffect(() => { api('/clientes').then(setClientes).catch(() => {}); }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const clientesPorId = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => m.set(c.id, c));
    return m;
  }, [clientes]);

  async function archivar(id) {
    if (!confirm('¿Archivar este proyecto? Desaparecerá del tablero y del listado.\nPodrás recuperarlo desde la sección Archivados.')) return;
    await api(`/proyectos/${id}/archivar`, { method: 'PATCH' });
    cargar();
  }

  async function eliminar(id, codigo) {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE el proyecto ${codigo}?\n\nEsta acción no se puede deshacer.`)) return;
    // El backend exige archivar primero, igual que en la app HTML
    await api(`/proyectos/${id}/archivar`, { method: 'PATCH' });
    await api(`/proyectos/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text">
          Listado de proyectos <span className="ml-1 text-[11px] font-mono font-normal text-text3 bg-ink-soft px-2 py-0.5 rounded-full">{proyectos.length}</span>
        </h1>
        <div className="flex gap-2">
          <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} className={selectClass}>
            <option value="">Todas las marcas</option>
            {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={selectClass}>
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={selectClass}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
          </select>
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className={selectClass}>
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
              <th className="px-3 py-2 font-semibold">Código</th>
              <th className="font-semibold">Nombre</th>
              <th className="font-semibold">Cliente</th>
              <th className="font-semibold">Marca</th>
              <th className="font-semibold">Tipo</th>
              <th className="font-semibold">Estado</th>
              <th className="font-semibold">Alta</th>
              <th className="font-semibold">Entrega</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proyectos.map(p => {
              const cliente = clientesPorId.get(p.cliente_id);
              return (
                <tr key={p.id} className="border-b border-border/60 hover:bg-bg-app cursor-pointer" onClick={() => setModalProyecto(p)}>
                  <td className="px-3 py-2 font-mono text-ink">{p.codigo}</td>
                  <td>{p.nombre || ''}</td>
                  <td>{cliente?.nombre || ''}</td>
                  <td>{p.marca}</td>
                  <td>{p.tipo_trabajo}</td>
                  <td><span className="text-[10.5px] bg-ink-soft text-ink px-2 py-0.5 rounded-full font-semibold">{ESTADO_LABELS[p.estado] || p.estado}</span></td>
                  <td className="font-mono text-text3">{(p.fecha_alta || '').slice(0, 10)}</td>
                  <td className="font-mono text-text3">{p.fecha_entrega_compromiso || '—'}</td>
                  <td className="whitespace-nowrap pr-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => archivar(p.id)} title="Archivar"
                      className="inline-flex items-center gap-1 border border-border rounded px-2 py-1 text-[11px] text-text2 hover:bg-bg-app mr-1">
                      <Archive size={11} /> Archivar
                    </button>
                    <button onClick={() => eliminar(p.id, p.codigo)} title="Eliminar"
                      className="inline-flex items-center gap-1 border border-red-300 rounded px-2 py-1 text-[11px] text-red-500 hover:bg-red-50">
                      <Trash2 size={11} /> Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
            {proyectos.length === 0 && (
              <tr><td colSpan={9} className="text-center text-text3 py-6">Sin proyectos con estos filtros</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalProyecto && (
        <ProjectModal
          proyecto={modalProyecto}
          cliente={clientesPorId.get(modalProyecto.cliente_id)}
          onClose={() => setModalProyecto(null)}
          onSaved={cargar}
        />
      )}
    </div>
  );
}
