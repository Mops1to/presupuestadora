import { useState } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext';
import Login from './core/Login';
import Layout from './core/Layout';
import Tablero from './modules/tablero/Tablero';
import Presupuestador from './modules/presupuestador/Presupuestador';
import Proyectos from './modules/proyectos/Proyectos';
import Listado from './modules/listado/Listado';
import Albaranes from './modules/albaranes/Albaranes';
import Facturas from './modules/facturas/Facturas';
import FacturasEmitidas from './modules/facturas-emitidas/FacturasEmitidas';
import BienesInversion from './modules/bienes-inversion/BienesInversion';
import MiPiso from './modules/mi-piso/MiPiso';
import Contabilidad from './modules/contabilidad/Contabilidad';
import VentasMenores from './modules/ventas-menores/VentasMenores';
import Usuarios from './modules/usuarios/Usuarios';
import Configuracion from './modules/configuracion/Configuracion';
import Amortizacion from './modules/amortizacion/Amortizacion';
import Consumibles from './modules/consumibles/Consumibles';
import Stock from './modules/stock/Stock';
import Historial from './modules/historial/Historial';
import Archivados from './modules/archivados/Archivados';

function AppShell() {
  const { user, loading } = useAuth();
  const [active, setActive] = useState('tablero');

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-text3 text-sm">Cargando...</div>;
  }

  if (!user || user.debeCambiarPassword) {
    return <Login />;
  }

  return (
    <Layout active={active} onNavigate={setActive}>
      {active === 'tablero' && <Tablero />}
      {active === 'presupuestador' && <Presupuestador />}
      {active === 'proyectos' && <Proyectos />}
      {active === 'listado' && <Listado />}
      {active === 'albaranes' && <Albaranes />}
      {active === 'facturas' && <Facturas />}
      {active === 'facturas-emitidas' && <FacturasEmitidas />}
      {active === 'bienes-inversion' && <BienesInversion />}
      {active === 'mi-piso' && <MiPiso />}
      {active === 'contabilidad' && <Contabilidad />}
      {active === 'ventas-menores' && <VentasMenores />}
      {active === 'usuarios' && user.rol === 'master' && <Usuarios />}
      {active === 'configuracion' && <Configuracion />}
      {active === 'amortizacion' && <Amortizacion />}
      {active === 'consumibles' && <Consumibles />}
      {active === 'stock' && <Stock />}
      {active === 'historial' && <Historial />}
      {active === 'archivados' && <Archivados />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
