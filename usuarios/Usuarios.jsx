import { useEffect, useState } from 'react';
import { api } from '../../core/api';

// Mismos módulos que Layout.jsx (menos "usuarios" en sí, que nunca es
// restringible — es exclusivo del rol master, siempre).
const MODULOS_TOGGLEABLES = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'listado', label: 'Listado' },
  { id: 'presupuestador', label: 'Presupuestador' },
  { id: 'albaranes', label: 'Albaranes' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'bienes-inversion', label: 'Bienes de inversión' },
  { id: 'contabilidad', label: 'Contabilidad' },
  { id: 'mi-piso', label: 'Mi Piso' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'amortizacion', label: 'Amortización' },
  { id: 'consumibles', label: 'Consumibles' },
  { id: 'stock', label: 'Stock' },
  { id: 'historial', label: 'Historial' },
  { id: 'archivados', label: 'Archivados' },
];

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [status, setStatus] = useState('');

  async function cargar() {
    setUsuarios(await api('/usuarios'));
  }

  useEffect(() => { cargar(); }, []);

  async function toggleModulo(usuario, moduloId) {
    const actuales = usuario.modulos_restringidos || [];
    const nuevos = actuales.includes(moduloId)
      ? actuales.filter(m => m !== moduloId)
      : [...actuales, moduloId];
    // optimista, para que el clic se sienta instantáneo
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, modulos_restringidos: nuevos } : u));
    try {
      await api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ modulos_restringidos: nuevos }) });
    } catch (e) {
      setStatus('Error: ' + e.message);
      cargar(); // si falla, recargamos de verdad para no dejar el optimista mintiendo
    }
  }

  async function resetPassword(usuario) {
    const nueva = prompt(`Nueva contraseña temporal para ${usuario.nombre} (mínimo 6 caracteres):`);
    if (!nueva) return;
    if (nueva.length < 6) { alert('Mínimo 6 caracteres'); return; }
    try {
      await api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ reset_password: nueva }) });
      setStatus(`✓ Contraseña reseteada para ${usuario.nombre} — se lo tendrá que cambiar en el próximo login`);
    } catch (e) { setStatus('Error: ' + e.message); }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Usuarios y permisos</h1>
      <p className="text-[13px] text-text3 mb-4">
        Marca qué módulos NO puede ver cada persona. Sin nada marcado, ve toda la app.
        Esta pantalla solo la ves tú (rol master).
      </p>
      {status && <div className="text-[12px] text-text2 mb-3">{status}</div>}

      <div className="flex flex-col gap-4">
        {usuarios.map(u => (
          <div key={u.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <span className="font-semibold text-text text-[14px]">{u.nombre}</span>
                <span className="ml-2 text-[11px] font-mono text-text3">{u.login}</span>
                {u.rol === 'master' && <span className="ml-2 text-[10px] bg-ink-soft text-ink px-1.5 py-0.5 rounded-full font-semibold">MASTER</span>}
              </div>
              {u.rol !== 'master' && (
                <button onClick={() => resetPassword(u)} className="text-[11.5px] border border-border rounded-md px-2.5 py-1 text-text2 hover:bg-bg-app">
                  Resetear contraseña
                </button>
              )}
            </div>

            {u.rol === 'master' ? (
              <p className="text-[12px] text-text3">El usuario master siempre ve toda la app — no se le puede restringir nada.</p>
            ) : (
              <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
                {MODULOS_TOGGLEABLES.map(m => {
                  const restringido = (u.modulos_restringidos || []).includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-1.5 text-[12px] text-text2 cursor-pointer">
                      <input type="checkbox" checked={!restringido} onChange={() => toggleModulo(u, m.id)} className="accent-ink" />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
