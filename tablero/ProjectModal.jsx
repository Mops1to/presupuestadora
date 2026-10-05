import { useEffect, useRef, useState } from 'react';
import { Archive, Star, Trash2, X } from 'lucide-react';
import { api, apiUpload, API_BASE } from '../../core/api';

const PRIORIDADES = [
  { id: 'baja', label: 'Baja', color: '#94a3b8' },
  { id: 'normal', label: 'Normal', color: '#cbd5e1' },
  { id: 'alta', label: 'Alta', color: '#f59e0b' },
  { id: 'urgente', label: 'Urgente', color: '#e74c3c' },
];

export default function ProjectModal({ proyecto, cliente, onClose, onSaved }) {
  const [notas, setNotas] = useState(proyecto.notas || '');
  const [imagen, setImagen] = useState(proyecto.imagen_portada_ruta || '');
  const [prioridad, setPrioridad] = useState(proyecto.prioridad || 'normal');
  const [fechaEntregaReal, setFechaEntregaReal] = useState(proyecto.fecha_entrega_real || '');
  const [fechaFacturacion, setFechaFacturacion] = useState(proyecto.fecha_facturacion || '');
  const [fechaCobro, setFechaCobro] = useState(proyecto.fecha_cobro || '');

  const [fotos, setFotos] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [status, setStatus] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    cargarFotos();
    cargarComentarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  async function cargarFotos() {
    try { setFotos(await api(`/proyectos/${proyecto.id}/fotos`)); } catch { /* silencioso */ }
  }
  async function cargarComentarios() {
    try { setComentarios(await api(`/proyectos/${proyecto.id}/comentarios`)); } catch { /* silencioso */ }
  }

  async function guardarFicha() {
    try {
      await api(`/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prioridad,
          fecha_entrega_real: fechaEntregaReal || null,
          fecha_facturacion: fechaFacturacion || null,
          fecha_cobro: fechaCobro || null,
        }),
      });
      await api(`/proyectos/${proyecto.id}/notas`, { method: 'PATCH', body: JSON.stringify({ notas }) });
      await api(`/proyectos/${proyecto.id}/imagen`, { method: 'PATCH', body: JSON.stringify({ ruta: imagen }) });
      setStatus('✓ Guardado');
      onSaved();
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function elegirPrioridad(p) {
    setPrioridad(p);
    try {
      await api(`/proyectos/${proyecto.id}`, { method: 'PATCH', body: JSON.stringify({ prioridad: p }) });
      onSaved();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function subirFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setStatus('Subiendo...');
    try {
      await apiUpload(`/proyectos/${proyecto.id}/fotos`, fd);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatus('✓ Foto añadida');
      cargarFotos();
      onSaved();
    } catch (err) { setStatus('Error: ' + err.message); }
  }

  async function borrarFoto(fotoId, url) {
    if (!confirm('¿Borrar esta foto?')) return;
    try {
      await api(`/proyectos/${proyecto.id}/fotos/${fotoId}`, { method: 'DELETE' });
      // si la foto borrada era la portada, se limpia también aquí al instante
      // (el backend ya la limpió en la base de datos, esto solo evita esperar
      // a una recarga para verlo reflejado)
      if (url && url === imagen) setImagen('');
      cargarFotos();
      onSaved();
    }
    catch (e) { setStatus('Error: ' + e.message); }
  }

  async function usarComoPortada(url) {
    setImagen(url);
    try {
      await api(`/proyectos/${proyecto.id}/imagen`, { method: 'PATCH', body: JSON.stringify({ ruta: url }) });
      setStatus('✓ Portada actualizada');
      onSaved();
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  async function enviarComentario() {
    const texto = nuevoComentario.trim();
    if (!texto) return;
    try {
      await api(`/proyectos/${proyecto.id}/comentarios`, { method: 'POST', body: JSON.stringify({ texto }) });
      setNuevoComentario('');
      cargarComentarios();
      onSaved();
    } catch (e) { alert('Error al comentar: ' + e.message); }
  }

  async function archivarProyecto() {
    if (!confirm(`¿Archivar el proyecto ${proyecto.codigo}? Desaparecerá del tablero — podrás recuperarlo desde Archivados.`)) return;
    try {
      await api(`/proyectos/${proyecto.id}/archivar`, { method: 'PATCH' });
      onSaved();
      onClose();
    } catch (e) { setStatus('Error al archivar: ' + e.message); }
  }

  const inputClass = 'w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-ink-light';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-[480px] max-h-[88vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-base font-semibold text-text">{proyecto.codigo}</h3>
          <div className="flex items-center gap-3">
            <button onClick={archivarProyecto} title="Archivar proyecto" className="text-text3 hover:text-amber-600">
              <Archive size={17} />
            </button>
            <button onClick={onClose} className="text-text3 hover:text-text"><X size={18} /></button>
          </div>
        </div>
        <div className="text-xs text-text2 mb-4">{cliente?.nombre || 'Sin cliente'}</div>

        <label className="text-[11px] text-text3 font-medium">Prioridad</label>
        <div className="flex gap-1.5 mb-4 mt-1">
          {PRIORIDADES.map(p => (
            <button
              key={p.id}
              onClick={() => elegirPrioridad(p.id)}
              style={{ '--pc': p.color, borderColor: p.color, background: prioridad === p.id ? p.color : 'white', color: prioridad === p.id ? 'white' : '#374151' }}
              className="border-2 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="text-[11px] text-text3 font-medium">Notas</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} className={inputClass + ' mb-3 mt-1'} />

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-[11px] text-text3 font-medium">Entrega real</label>
            <input type="date" value={fechaEntregaReal} onChange={e => setFechaEntregaReal(e.target.value)} className={inputClass + ' mt-1'} />
          </div>
          <div>
            <label className="text-[11px] text-text3 font-medium">Facturación</label>
            <input type="date" value={fechaFacturacion} onChange={e => setFechaFacturacion(e.target.value)} className={inputClass + ' mt-1'} />
          </div>
          <div>
            <label className="text-[11px] text-text3 font-medium">Cobro</label>
            <input type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} className={inputClass + ' mt-1'} />
          </div>
        </div>

        <div className="flex gap-2 mb-1">
          <button onClick={guardarFicha} className="bg-ink hover:bg-ink-light text-white text-[12.5px] font-semibold rounded-md px-3.5 py-1.5">
            Guardar
          </button>
        </div>
        {status && <div className="text-[11px] text-text2 mt-1">{status}</div>}

        <hr className="border-border my-4" />
        <label className="text-[11px] text-text3 font-medium">📷 Fotos</label>
        <div className="flex flex-wrap gap-2 my-2">
          {fotos.map(f => {
            const url = `${API_BASE}/proyectos/${proyecto.id}/fotos/${f.filename}`;
            return (
              <div key={f.id} className="relative w-[70px] h-[70px] rounded-lg overflow-hidden border border-border group">
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button onClick={() => borrarFoto(f.id, url)} title="Borrar foto"
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-[18px] h-[18px] text-[10px] flex items-center justify-center">
                  <Trash2 size={10} />
                </button>
                <button onClick={() => usarComoPortada(url)} title="Usar como portada"
                  className="absolute top-0.5 left-0.5 bg-black/60 text-amber-300 rounded-full w-[18px] h-[18px] text-[10px] flex items-center justify-center">
                  <Star size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={subirFoto} className="hidden" id="foto-input" />
        <button onClick={() => fileInputRef.current?.click()} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app">
          + Añadir foto
        </button>

        <hr className="border-border my-4" />
        <label className="text-[11px] text-text3 font-medium">💬 Comentarios</label>
        <div className="flex flex-col gap-1.5 my-2 max-h-[180px] overflow-y-auto">
          {comentarios.length === 0 && <div className="text-[11.5px] text-text3">Sin comentarios todavía.</div>}
          {comentarios.map(c => (
            <div key={c.id} className="bg-bg-app border border-border rounded-md px-2.5 py-2 text-[12.5px]">
              <div className="flex justify-between text-[10.5px] text-text3 mb-0.5">
                <b className="text-ink">{c.usuario || '—'}</b>
                <span>{(c.fecha || '').replace('T', ' ').slice(0, 16)}</span>
              </div>
              {c.texto}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)} rows={1}
            placeholder="Escribe un comentario..." className={inputClass} />
          <button onClick={enviarComentario} className="text-[12px] border border-border rounded-md px-3 py-1.5 text-text2 hover:bg-bg-app self-end shrink-0">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
