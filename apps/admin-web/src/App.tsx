import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { RoleSwitcher } from './components/RoleSwitcher';
import { MobileLayout } from './components/MobileLayout';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminAuthProvider } from './api/auth-context';
import { LandingPage } from './pages/LandingPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { MetricasPage } from './pages/admin/MetricasPage';
import { ClientesPage } from './pages/admin/ClientesPage';
import { CampanasPage } from './pages/admin/CampanasPage';
import { CampanaDetallePage } from './pages/admin/CampanaDetallePage';
import { TurnosPage } from './pages/admin/TurnosPage';
import { UsuariosPage } from './pages/admin/UsuariosPage';
import { AuditoriaPage } from './pages/admin/AuditoriaPage';
import { LoginPage } from './pages/mobile/LoginPage';
import { PerfilPage } from './pages/mobile/PerfilPage';
import { SeleccionarCampanaPage } from './pages/mobile/agente/SeleccionarCampanaPage';
import { TurnoPage } from './pages/mobile/agente/TurnoPage';
import { NuevoReportePage } from './pages/mobile/agente/NuevoReportePage';
import { MisReportesPage } from './pages/mobile/agente/MisReportesPage';
import { DashboardPage } from './pages/mobile/cliente/DashboardPage';
import { DetalleReportePage } from './pages/mobile/cliente/DetalleReportePage';
import { SeguimientosPage } from './pages/mobile/cliente/SeguimientosPage';
import { ExportarPage } from './pages/mobile/cliente/ExportarPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin/metricas"
            element={
              <AdminAuthGate>
                <MetricasPage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/clientes"
            element={
              <AdminAuthGate>
                <ClientesPage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/campanas"
            element={
              <AdminAuthGate>
                <CampanasPage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/campanas/:id"
            element={
              <AdminAuthGate>
                <CampanaDetallePage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/turnos"
            element={
              <AdminAuthGate>
                <TurnosPage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <AdminAuthGate>
                <UsuariosPage />
              </AdminAuthGate>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <AdminAuthGate>
                <AuditoriaPage />
              </AdminAuthGate>
            }
          />

          <Route path="/mobile" element={<MobileLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="perfil" element={<PerfilPage />} />
            <Route path="agente/seleccionar-campana" element={<SeleccionarCampanaPage />} />
            <Route path="agente/turno" element={<TurnoPage />} />
            <Route path="agente/nuevo-reporte" element={<NuevoReportePage />} />
            <Route path="agente/mis-reportes" element={<MisReportesPage />} />
            <Route path="cliente/dashboard" element={<DashboardPage />} />
            <Route path="cliente/reporte/:id" element={<DetalleReportePage />} />
            <Route path="cliente/seguimientos" element={<SeguimientosPage />} />
            <Route path="cliente/exportar" element={<ExportarPage />} />
          </Route>
        </Routes>
        <RoleSwitcher />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
