import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { useStore } from '../../../store/AppStore';
import { reportsToday } from '../../../lib/selectors';

const agentTabs = [
  { to: '/mobile/agente/nuevo-reporte', label: 'Reportar', icon: 'edit' },
  { to: '/mobile/agente/mis-reportes', label: 'Mis reportes', icon: 'list_alt' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];

export function SeleccionarCampanaPage() {
  const { state, currentUser, selectAgentCampaign } = useStore();
  const navigate = useNavigate();

  const myCampaigns = state.campaigns.filter((c) => currentUser && c.agentIds.includes(currentUser.id));

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="CallReport" />
      <div className="flex-1 overflow-y-auto hide-scrollbar px-md py-lg pb-24">
        <h2 className="font-headline-md text-headline-md text-on-background mb-xs">Selecciona tu campaña</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">Los reportes que crees se asignarán a esta campaña</p>
        <div className="flex flex-col gap-md">
          {myCampaigns.map((c) => {
            const tenant = state.tenants.find((t) => t.id === c.tenantId);
            const todayCount = reportsToday(state.reports.filter((r) => r.campaignId === c.id && r.agentId === currentUser?.id)).length;
            const isSelected = state.session.agentCampaignId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  selectAgentCampaign(c.id);
                  navigate('/mobile/agente/nuevo-reporte');
                }}
                className={`text-left bg-surface-container-lowest border rounded-xl p-md shadow-sm transition-colors flex items-center justify-between ${
                  isSelected ? 'border-primary border-2' : 'border-outline-variant'
                }`}
              >
                <div>
                  <p className="font-label-md text-label-md text-on-surface font-bold">{tenant?.name}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{c.name}</p>
                  <span className="inline-block mt-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[10px]">{todayCount} hoy</span>
                </div>
                {isSelected && <Icon name="check_circle" filled className="text-primary text-[24px]" />}
              </button>
            );
          })}
          {myCampaigns.length === 0 && <p className="font-body-md text-body-md text-on-surface-variant">No tienes campañas asignadas.</p>}
        </div>
      </div>
      <BottomTabBar items={agentTabs} active="/mobile/agente/nuevo-reporte" />
    </div>
  );
}
