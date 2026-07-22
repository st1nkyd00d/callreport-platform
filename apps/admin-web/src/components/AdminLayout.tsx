import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { useStore } from '../store/AppStore';
import { ROLE_LABELS } from '@callreport/shared';
import { initials } from '../lib/format';

const navItems = [
  { to: '/admin/metricas', label: 'Métricas', icon: 'bar_chart' },
  { to: '/admin/clientes', label: 'Clientes', icon: 'business' },
  { to: '/admin/campanas', label: 'Campañas', icon: 'campaign' },
  { to: '/admin/usuarios', label: 'Usuarios', icon: 'manage_accounts' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: 'fact_check' },
];

export function AdminLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { currentUser } = useStore();
  return (
    <div className="flex h-screen overflow-hidden antialiased">
      <aside className="hidden md:flex flex-col w-sidebar-width bg-surface border-r border-outline-variant flex-shrink-0">
        <div className="h-16 flex items-center px-lg border-b border-outline-variant gap-sm">
          <Icon name="phone_in_talk" filled className="text-primary" />
          <span className="font-headline-md text-headline-md text-primary">CallReport</span>
        </div>
        <nav className="flex-1 py-lg px-md space-y-sm overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-md px-md py-sm rounded font-label-md text-label-md transition-colors ${
                  isActive
                    ? 'bg-[#EEF2FF] border-l-[3px] border-primary text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-md border-t border-outline-variant">
          <div className="flex items-center gap-sm">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-sm text-label-sm border border-outline-variant">
              {currentUser ? initials(currentUser.fullName) : '--'}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-label-md text-label-md text-on-surface truncate">{currentUser?.fullName ?? 'Invitado'}</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">{currentUser ? ROLE_LABELS[currentUser.role] : ''}</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 flex items-center justify-between px-md md:px-xl bg-surface border-b border-outline-variant z-10 flex-shrink-0">
          <div className="flex items-center gap-md md:hidden">
            <span className="font-headline-md text-headline-md text-primary">CallReport</span>
          </div>
          <h1 className="hidden md:block font-headline-sm text-headline-sm text-on-surface">{title}</h1>
          <div className="flex items-center gap-md">{actions}</div>
        </header>
        <div className="flex-1 overflow-y-auto p-md md:p-xl bg-background">
          <div className="max-w-container-max mx-auto space-y-xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
