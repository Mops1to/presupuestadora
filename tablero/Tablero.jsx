import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../core/api';
import ProjectCard from './ProjectCard';
import ProjectModal from './ProjectModal';

const ESTADOS = [
  { id: 'presupuestado', label: 'Presupuestado' },
  { id: 'aceptado', label: 'Aceptado' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'facturado', label: 'Facturado' },
  { id: 'cobrado', label: 'Cobrado' },
];

const MARCAS = ['myrox_lab', 'myrox_print', 'myrox_works', 'myrox_automation', 'mw3d'];
const TIPOS = ['IR', 'D', 'DO', 'I3D', 'MD', 'FA'];

export default function Tablero() {
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverEstado, setDragOverEstado] = useState(null);
  const [modalProyecto, setModalProyecto] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroMarca) params.append('marca', filtroMarca);
    if (filtroTipo) params.append('tipo_trabajo', filtroTipo);
    if (filtroCliente) params.append('cliente_id', filtroCliente);
    try {
      const data = await api('/proyectos?' + params.toString());
      setProyectos(data);
    } finally {
      setLoading(false);
    }
  }, [filtroMarca, filtroTipo, filtroCliente]);

  useEffect(() => {
    api('/clientes').then(setClientes).catch(() => {});
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const clientesPorId = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => m.set(c.id, c));
    return m;
  }, [clientes]);

  const proyectosPorEstado = useMemo(() => {
    const grupos = {};
    ESTADOS.forEach(e => { grupos[e.id] = []; });
    proyectos.forEach(p => { (grupos[p.estado] || (grupos[p.estado] = [])).push(p); });
    return grupos;
  }, [proyectos]);

  async function soltarEnColumna(estadoId) {
    setDragOverEstado(null);
    if (!draggedId) return;
    const proyecto = proyectos.find(p => p.id === draggedId);
    if (!proyecto || proyecto.estado === estadoId) { setDraggedId(null); return; }
    // optimista: lo movemos ya en pantalla, y si falla lo recargamos de verdad
    setProyectos(prev => prev.map(p => (p.id === draggedId ? { ...p, estado: estadoId } : p)));
    setDraggedId(null);
    try {
      await api(`/proyectos/${proyecto.id}`, { method: 'PATCH', body: JSON.stringify({ estado: estadoId }) });
    } catch {
      cargar();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-text">
          Tablero <span className="ml-1 text-[11px] font-mono font-normal text-text3 bg-ink-soft px-2 py-0.5 rounded-full">{proyectos.length} proyectos</span>
        </h1>
        <div className="flex gap-2">
          <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white">
            <option value="">Todas las marcas</option>
            {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white">
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white">
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-text3 text-sm">Cargando...</div>
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-3">
          {ESTADOS.map(estado => {
            const items = proyectosPorEstado[estado.id] || [];
            return (
              <div key={estado.id} className="bg-bg-app rounded-xl flex-1 min-w-[240px] max-w-[320px] flex flex-col">
                <div className="px-3.5 py-3 flex justify-between items-center text-[11.5px] uppercase tracking-wide text-text2 font-bold">
                  {estado.label}
                  <span className="font-mono">{items.length}</span>
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOverEstado(estado.id); }}
                  onDragLeave={() => setDragOverEstado(null)}
                  onDrop={() => soltarEnColumna(estado.id)}
                  className={`px-2 pb-2 flex-1 flex flex-col gap-2 min-h-[80px] rounded-lg transition-colors ${dragOverEstado === estado.id ? 'bg-ink-soft' : ''}`}
                >
                  {items.map(p => (
                    <ProjectCard
                      key={p.id}
                      proyecto={p}
                      cliente={clientesPorId.get(p.cliente_id)}
                      onOpen={setModalProyecto}
                      onDragStart={setDraggedId}
                      onDragEnd={() => setDraggedId(null)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
