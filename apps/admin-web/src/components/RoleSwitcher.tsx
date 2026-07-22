import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { ROLE_LABELS } from '@callreport/shared';
import { Icon } from './Icon';

const landingByRole: Record<string, string> = {
  super_admin: '/admin/metricas',
  supervisor: '/admin/metricas',
  agent: '/mobile/agente/nuevo-reporte',
  client_user: '/mobile/cliente/dashboard',
};

export function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const { state, currentUser, switchUser } = useStore();
  const navigate = useNavigate();

  const groups: { label: string; role: string }[] = [
    { label: 'Administración', role: 'super_admin' },
    { label: 'Supervisión', role: 'supervisor' },
    { label: 'Agentes (móvil)', role: 'agent' },
    { label: 'Clientes (móvil)', role: 'client_user' },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-[200]">
      {open && (
        <div className="mb-2 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
          <div className="px-md py-sm bg-surface-container-low border-b border-outline-variant">
            <p className="font-label-md text-label-md text-on-surface">Modo demo — cambiar de rol</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Sin backend real: cambia de usuario al instante</p>
          </div>
          <div className="max-h-96 overflow-y-auto py-xs">
            {groups.map((g) => {
              const groupUsers = state.users.filter((u) => u.role === g.role);
              if (groupUsers.length === 0) return null;
              return (
                <div key={g.role} className="px-sm py-xs">
                  <p className="px-sm font-label-sm text-label-sm text-on-surface-variant uppercase mb-1">{g.label}</p>
                  {groupUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        navigate(landingByRole[u.role]);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-sm py-2 rounded-lg flex items-center justify-between gap-2 hover:bg-surface-container-low transition-colors ${
                        currentUser?.id === u.id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="font-body-md text-body-md text-on-surface truncate">{u.fullName}</span>
                      {currentUser?.id === u.id && <Icon name="check_circle" className="text-primary text-[16px]" filled />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-primary text-on-primary shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        title="Cambiar rol de demo"
      >
        <Icon name={open ? 'close' : 'switch_account'} />
      </button>
      {currentUser && !open && (
        <div className="absolute bottom-1 right-16 bg-inverse-surface text-inverse-on-surface text-[11px] px-2 py-1 rounded whitespace-nowrap">
          {currentUser.fullName} · {ROLE_LABELS[currentUser.role]}
        </div>
      )}
    </div>
  );
}
