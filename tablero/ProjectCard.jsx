import { useState } from 'react';
import { ImageOff } from 'lucide-react';

const PRIO_BORDER = {
  baja: 'border-l-prio-baja',
  alta: 'border-l-prio-alta',
  urgente: 'border-l-prio-urgente',
};

export default function ProjectCard({ proyecto, cliente, onOpen, onDragStart, onDragEnd }) {
  const prioClass = PRIO_BORDER[proyecto.prioridad] || 'border-l-transparent';
  const [portadaRota, setPortadaRota] = useState(false);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(proyecto.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(proyecto)}
      className={`bg-white border border-border ${prioClass} border-l-4 rounded-lg p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow`}
    >
      {proyecto.imagen_portada_ruta && (
        portadaRota ? (
          <div className="w-full aspect-square rounded-md mb-1.5 bg-bg-app flex flex-col items-center justify-center gap-1 text-text3">
            <ImageOff size={22} strokeWidth={1.5} />
            <span className="text-[10px]">Portada no disponible</span>
          </div>
        ) : (
          <img
            src={proyecto.imagen_portada_ruta}
            alt=""
            className="w-full aspect-square object-cover rounded-md mb-1.5 bg-bg-app"
            onError={() => setPortadaRota(true)}
          />
        )
      )}
      <div className="font-mono text-[10.5px] text-ink font-semibold">{proyecto.codigo}</div>
      <div className="text-[13px] font-semibold text-text mt-0.5">{proyecto.nombre || '(sin nombre)'}</div>
      <div className="text-[11.5px] text-text2 mt-0.5">{cliente?.nombre || ''}</div>
      <span className="inline-block text-[9.5px] px-2 py-0.5 rounded-full bg-ink-soft text-ink font-semibold mt-1.5">
        {proyecto.marca}
      </span>
      {proyecto.notas && (
        <div className="text-[11px] text-text3 italic mt-1.5 line-clamp-2">{proyecto.notas}</div>
      )}
      {(proyecto.num_fotos > 0 || proyecto.num_comentarios > 0) && (
        <div className="flex gap-2.5 mt-1.5 text-[10.5px] text-text3">
          {proyecto.num_fotos > 0 && <span>📷 {proyecto.num_fotos}</span>}
          {proyecto.num_comentarios > 0 && <span>💬 {proyecto.num_comentarios}</span>}
        </div>
      )}
    </div>
  );
}
