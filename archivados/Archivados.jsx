import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../core/api';

export default function Archivados() {
  const [lista, setLista] = useState([]);

  async function cargar() {
    setLista(await api('/proyectos/archivados'));
  }

  useEffect(() => { cargar(); }, []);

  async function restaurar(id) {
    await api(`/proyectos/${id}/desarchivar`, { method: 'PATCH' });
    cargar();
  }

  async function eliminar(id, codigo) {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE el proyecto ${codigo}?\n\nEsta acción no se puede deshacer.`)) return;
    await api(`/proyectos/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-text mb-1">Proyectos archivados</h1>
      <p className="text-[13px] text-text3 mb-4">
        Los proyectos archivados no aparecen en el tablero ni en el listado. Puedes restaurarlos o eliminarlos definitivamente.
      </p>

      {lista.length === 0 ? (
        <p className="text-[13px] text-text3">No hay proyectos archivados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-bg-app border border-border rounded-lg px-4 py-3">
              <div>
                <span className="font-mono text-[12px] text-text3">{p.codigo}</span>
                <span className="ml-3 font-medium text-text">{p.nombre || '(sin nombre)'}</span>
                <span className="ml-2 text-[12px] text-text3">{p.cliente_nombre || ''}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => restaurar(p.id)}
                  className="flex items-center gap-1 text-[12px] border border-border rounded-md px-2.5 py-1 text-text2 hover:bg-white">
                  <RotateCcw size={12} /> Restaurar
                </button>
                <button onClick={() => eliminar(p.id, p.codigo)}
                  className="flex items-center gap-1 text-[12px] rounded-md px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white">
                  <Trash2 size={12} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
