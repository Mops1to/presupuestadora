import { useState } from 'react';
import { LayoutGrid, FileText, ListChecks, Calculator, Truck, Settings, Wrench, Package, Boxes,
  History, Archive, Receipt, PiggyBank, Home, Users, BarChart3, Folder, Wallet, Warehouse,
  Tag, FileOutput, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from './AuthContext';

// Módulos organizados en familias, para no tener 18 entradas sueltas en el
// menú. "family: null" = siempre visible arriba, sin agrupar. El id de la
// familia (no el del módulo) es lo que se usa para colapsar/expandir.
const MODULES = [
  { id: 'tablero', label: 'Tablero', icon: LayoutGrid, family: null },
  { id: 'mi-piso', label: 'Mi Piso', icon: Home, family: null },

  { id: 'proyectos', label: 'Proyectos', icon: FileText, family: 'proyectos' },
  { id: 'listado', label: 'Listado', icon: ListChecks, family: 'proyectos' },
  { id: 'presupuestador', label: 'Presupuestador', icon: Calculator, family: 'proyectos' },
  { id: 'albaranes', label: 'Albaranes', icon: Truck, family: 'proyectos' },
  { id: 'historial', label: 'Historial', icon: History, family: 'proyectos' },
  { id: 'archivados', label: 'Archivados', icon: Archive, family: 'proyectos' },

  { id: 'contabilidad', label: 'Contabilidad', icon: BarChart3, family: 'finanzas' },
  { id: 'facturas', label: 'Facturas', icon: Receipt, family: 'finanzas' },
  { id: 'facturas-emitidas', label: 'Facturas emitidas', icon: FileOutput, family: 'finanzas' },
  { id: 'bienes-inversion', label: 'Bienes de inversión', icon: PiggyBank, family: 'finanzas' },
  { id: 'amortizacion', label: 'Amortización', icon: Wrench, family: 'finanzas' },

  // Ventas menores va deliberadamente SUELTO, no dentro de Finanzas — así se
  // puede dar acceso a esto sin dar acceso al resto de la contabilidad.
  { id: 'ventas-menores', label: 'Ventas menores', icon: Tag, family: null },

  { id: 'stock', label: 'Stock', icon: Boxes, family: 'inventario' },
  { id: 'consumibles', label: 'Consumibles', icon: Package, family: 'inventario' },

  { id: 'configuracion', label: 'Configuración', icon: Settings, family: null },
];

const FAMILIAS = {
  proyectos: { label: 'Proyectos', icon: Folder },
  finanzas: { label: 'Finanzas', icon: Wallet },
  inventario: { label: 'Inventario', icon: Warehouse },
};

export default function Layout({ active, onNavigate, children }) {
  const { user, logout } = useAuth();
  const [expandidas, setExpandidas] = useState(new Set());

  const restringidos = user?.modulosRestringidos || [];
  const modulosVisibles = MODULES.filter(m => !restringidos.includes(m.id));
  if (user?.rol === 'master') {
    modulosVisibles.push({ id: 'usuarios', label: 'Usuarios y permisos', icon: Users, family: null });
  }

  const pinned = modulosVisibles.filter(m => !m.family);
  const porFamilia = {};
  for (const m of modulosVisibles) {
    if (m.family) (porFamilia[m.family] ||= []).push(m);
  }

  function toggleFamilia(id) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function BotonModulo(m) {
    const Icon = m.icon;
    const isActive = active === m.id;
    const listo = m.ready !== false;
    return (
      <button key={m.id} onClick={() => listo && onNavigate(m.id)} disabled={!listo}
        title={listo ? '' : 'Todavía en construcción'}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors
          ${isActive ? 'bg-ink-soft text-ink font-semibold' : listo ? 'text-text2 hover:bg-bg-app' : 'text-text3/50 cursor-not-allowed'}`}>
        <Icon size={16} strokeWidth={2} />
        <span>{m.label}</span>
        {!listo && <span className="ml-auto text-[9px] font-mono text-text3/60">pronto</span>}
      </button>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-white border-r border-border flex flex-col">
        <div className="px-5 py-6">
          <div className="text-lg font-extrabold text-ink tracking-wide">MYROX</div>
          <div className="text-[10px] text-text3 mt-0.5">Plataforma de gestión</div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {pinned.map(BotonModulo)}

          {Object.entries(porFamilia).map(([familiaId, miembros]) => {
            if (miembros.length === 0) return null;
            const familia = FAMILIAS[familiaId];
            const FamIcon = familia.icon;
            const contieneActivo = miembros.some(m => m.id === active);
            const abierta = expandidas.has(familiaId) || contieneActivo;
            return (
              <div key={familiaId} className="pt-1">
                <button onClick={() => toggleFamilia(familiaId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-text2 hover:bg-bg-app">
                  <FamIcon size={16} strokeWidth={2} />
                  <span className="flex-1 text-left">{familia.label}</span>
                  {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {abierta && (
                  <div className="pl-4 space-y-0.5">
                    {miembros.map(BotonModulo)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-text3">MW 3D Studio · Myrox</span>
          <button onClick={logout} className="text-[10px] font-mono text-text3 hover:text-ink" title="Cerrar sesión">
            👤 {user?.nombre}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
