import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@callreport/shared';
import { Icon } from '../../components/Icon';
import { MobileTopBar } from '../../components/MobileTopBar';
import { BottomTabBar } from '../../components/BottomTabBar';
import { useStore } from '../../store/AppStore';
import { initials } from '../../lib/format';
import { agentTabs, clientTabsBase as clientTabs } from '../../lib/tabs';

export function PerfilPage() {
  const { currentUser, state } = useStore();
  const navigate = useNavigate();
  const tabs = currentUser?.role === 'agent' ? agentTabs : clientTabs;
  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="Perfil" />
      <main className="flex-1 overflow-y-auto hide-scrollbar px-md py-lg pb-24 flex flex-col gap-lg">
        <div className="flex flex-col items-center gap-sm text-center">
          <div className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline-lg text-headline-lg">
            {currentUser ? initials(currentUser.fullName) : '--'}
          </div>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{currentUser?.fullName}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">{currentUser?.email}</p>
          </div>
          <span className="inline-flex items-center px-sm py-xs bg-surface-container text-on-surface-variant rounded-full font-label-sm text-label-sm">
            {currentUser ? ROLE_LABELS[currentUser.role] : ''} {tenant ? `· ${tenant.name}` : ''}
          </span>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant overflow-hidden">
          <div className="flex items-center gap-sm p-md">
            <Icon name="info" className="text-outline" />
            <span className="font-body-md text-body-md text-on-surface">Demo interactiva — CallReport v0 (Fase 1)</span>
          </div>
          <div className="flex items-center gap-sm p-md">
            <Icon name="storage" className="text-outline" />
            <span className="font-body-md text-body-md text-on-surface">Datos en memoria, sin backend real todavía</span>
          </div>
        </div>

        <button
          onClick={() => navigate('/mobile/login')}
          className="w-full py-3 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-surface-container-low transition-colors"
        >
          <Icon name="logout" /> Cerrar sesión
        </button>
      </main>
      <BottomTabBar items={tabs} active="/mobile/perfil" />
    </div>
  );
}
