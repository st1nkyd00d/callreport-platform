import type { TabItem } from '../components/BottomTabBar';

// Fuente única de las pestañas inferiores de agente/cliente — antes
// duplicadas en cada pantalla (NuevoReportePage, MisReportesPage,
// PerfilPage, DashboardPage, SeguimientosPage, ExportarPage).
export const agentTabs: TabItem[] = [
  { to: '/mobile/agente/turno', label: 'Turno', icon: 'punch_clock' },
  { to: '/mobile/agente/nuevo-reporte', label: 'Reportar', icon: 'edit' },
  { to: '/mobile/agente/mis-reportes', label: 'Mis reportes', icon: 'list_alt' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];

export const clientTabsBase: TabItem[] = [
  { to: '/mobile/cliente/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { to: '/mobile/cliente/seguimientos', label: 'Seguimientos', icon: 'history_toggle_off' },
  { to: '/mobile/cliente/exportar', label: 'Exportar', icon: 'download' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];
