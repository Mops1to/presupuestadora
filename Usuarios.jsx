import { useEffect, useState } from 'react';
import { api } from '../../core/api';

// Mismos módulos y familias que Layout.jsx (menos "usuarios" en sí, que
// nunca es restringible — es exclusivo del rol master, siempre).
const MODULOS_TOGGLEABLES = [
  { id: 'tablero', label: 'Tablero', family: null },
  { id: 'mi-piso', label: 'Mi Piso', family: null },

  { id: 'proyectos', label: 'Proyectos', family: 'proyectos' },
  { id: 'listado', label: 'Listado', family: 'proyectos' },
  { id: 'presupuestador', label: 'Presupuestador', family: 'proyectos' },
  { id: 'albaranes', label: 'Albaranes', family: 'proyectos' },
  { id: 'historial', label: 'Historial', family: 'proyectos' },
  { id: 'archivados', label: 'Archivados', family: 'proyectos' },

  { id: 'contabilidad', label: 'Contabilidad', family: 'finanzas' },
  { id: 'facturas', label: 'Facturas', family: 'finanzas' },
  { id: 'facturas-emitidas', label: 'Facturas emitidas', family: 'finanzas' },
  { id: 'bienes-inversion', label: 'Bienes de inversión', family: 'finanzas' },
  { id: 'amortizacion', label: 'Amortización', family: 'finanzas' },

  { id: 'ventas-menores', label: 'Ventas menores', family: null },

  { id: 'stock', label: 'Stock', family: 'inventario' },
  { id: 'consumibles', label: 'Consumibles', family: 'inventario' },

  { id: 'configuracion', label: 'Configuración', family: null },
];

const FAMILIAS = { proyectos: 'Proyectos', finanzas: 'Finanzas', inventario: 'Inventario' };

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [status, setStatus] = useState('');

  async function cargar() {
    setUsuarios(await api('/usuarios'));
  }

  useEffect(() => { cargar(); }, []);

  async function guardarRestringidos(usuario, nuevos) {
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, modulos_restringidos: nuevos } : u));
    try {
      await api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ modulos_restringidos: nuevos }) });
    } catch (e) {
      setStatus('Error: ' + e.message);
      cargar(); // si falla, recargamos de verdad para no dejar el optimista mintiendo
    }
  }

  function toggleModulo(usuario, moduloId) {
    const actuales = usuario.modulos_restringidos || [];
    const nuevos = actuales.includes(moduloId) ? actuales.filter(m => m !== moduloId) : [...actuales, moduloId];
    guardarRestringidos(usuario, nuevos);
  }

  function toggleFamilia(usuario, familiaId, miembros) {
    const actuales = usuario.modulos_restringidos || [];
    const idsFamilia = miembros.map(m => m.id);
    const todosVisibles = idsFamilia.every(id => !actuales.includes(id));
    // si ahora se ve toda la familia, la restringimos entera; si no, la abrimos entera
    const nuevos = todosVisibles
      ? [...actuales, ...idsFamilia.filter(id => !actuales.includes(id))]
      : actuales.filter(id => !idsFamilia.includes(id));
    guardarRestringidos(usuario, nuevos);
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

  const sueltos = MODULOS_TOGGLEABLES.filter(m => !m.family);
  const porFamilia = {};
  for (const m of MODULOS_TOGGLEABLES) {
    if (m.family) (porFamilia[m.family] ||= []).push(m);
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-text mb-1">Usuarios y permisos</h1>
      <p className="text-[13px] text-text3 mb-4">
        Marca qué módulos NO puede ver cada persona. Sin nada marcado, ve toda la app.
        El check de cada familia restringe o abre todos sus módulos de golpe.
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
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
                  {sueltos.map(m => {
                    const restringido = (u.modulos_restringidos || []).includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-1.5 text-[12px] text-text2 cursor-pointer">
                        <input type="checkbox" checked={!restringido} onChange={() => toggleModulo(u, m.id)} className="accent-ink" />
                        {m.label}
                      </label>
                    );
                  })}
                </div>

                {Object.entries(porFamilia).map(([familiaId, miembros]) => {
                  const restringidos = u.modulos_restringidos || [];
                  const todosVisibles = miembros.every(m => !restringidos.includes(m.id));
                  const ningunoVisible = miembros.every(m => restringidos.includes(m.id));
                  return (
                    <div key={familiaId} className="border-t border-border pt-2.5">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-text mb-1.5 cursor-pointer">
                        <input type="checkbox" checked={todosVisibles} ref={el => el && (el.indeterminate = !todosVisibles && !ningunoVisible)}
                          onChange={() => toggleFamilia(u, familiaId, miembros)} className="accent-ink" />
                        Familia {FAMILIAS[familiaId]} (entera)
                      </label>
                      <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 pl-5">
                        {miembros.map(m => {
                          const restringido = restringidos.includes(m.id);
                          return (
                            <label key={m.id} className="flex items-center gap-1.5 text-[12px] text-text2 cursor-pointer">
                              <input type="checkbox" checked={!restringido} onChange={() => toggleModulo(u, m.id)} className="accent-ink" />
                              {m.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
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
