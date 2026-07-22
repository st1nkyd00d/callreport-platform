import { Route, Routes } from 'react-router-dom';
import { RoleSwitcher } from './components/RoleSwitcher';
import { MobileLayout } from './components/MobileLayout';
import { LandingPage } from './pages/LandingPage';
import { MetricasPage } from './pages/admin/MetricasPage';
import { ClientesPage } from './pages/admin/ClientesPage';
import { CampanasPage } from './pages/admin/CampanasPage';
import { CampanaDetallePage } from './pages/admin/CampanaDetallePage';
import { UsuariosPage } from './pages/admin/UsuariosPage';
import { AuditoriaPage } from './pages/admin/AuditoriaPage';
import { LoginPage } from './pages/mobile/LoginPage';
import { PerfilPage } from './pages/mobile/PerfilPage';
import { SeleccionarCampanaPage } from './pages/mobile/agente/SeleccionarCampanaPage';
import { NuevoReportePage } from './pages/mobile/agente/NuevoReportePage';
import { MisReportesPage } from './pages/mobile/agente/MisReportesPage';
import { DashboardPage } from './pages/mobile/cliente/DashboardPage';
import { DetalleReportePage } from './pages/mobile/cliente/DetalleReportePage';
import { SeguimientosPage } from './pages/mobile/cliente/SeguimientosPage';
import { ExportarPage } from './pages/mobile/cliente/ExportarPage';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/admin/metricas" element={<MetricasPage />} />
        <Route path="/admin/clientes" element={<ClientesPage />} />
        <Route path="/admin/campanas" element={<CampanasPage />} />
        <Route path="/admin/campanas/:id" element={<CampanaDetallePage />} />
        <Route path="/admin/usuarios" element={<UsuariosPage />} />
        <Route path="/admin/auditoria" element={<AuditoriaPage />} />

        <Route path="/mobile" element={<MobileLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="agente/seleccionar-campana" element={<SeleccionarCampanaPage />} />
          <Route path="agente/nuevo-reporte" element={<NuevoReportePage />} />
          <Route path="agente/mis-reportes" element={<MisReportesPage />} />
          <Route path="cliente/dashboard" element={<DashboardPage />} />
          <Route path="cliente/reporte/:id" element={<DetalleReportePage />} />
          <Route path="cliente/seguimientos" element={<SeguimientosPage />} />
          <Route path="cliente/exportar" element={<ExportarPage />} />
        </Route>
      </Routes>
      <RoleSwitcher />
    </>
  );
}

export default App;
