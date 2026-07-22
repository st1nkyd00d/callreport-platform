import { Fragment, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Pill, type PillVariant } from '../../components/Pill';
import { useStore } from '../../store/AppStore';
import { formatDateTime } from '../../lib/format';
import type { AuditAction } from '@callreport/shared';

const actionLabel: Record<AuditAction, string> = {
  create: 'Creación',
  update: 'Modificación',
  resolve_followup: 'Resolución',
  suspend: 'Suspensión',
  delete: 'Eliminación',
};
const actionVariant: Record<AuditAction, PillVariant> = {
  create: 'success',
  update: 'warning',
  resolve_followup: 'primary',
  suspend: 'neutral',
  delete: 'error',
};

export function AuditoriaPage() {
  const { state } = useStore();
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.auditLogs.filter((log) => (userFilter === 'all' || log.userId === userFilter) && (actionFilter === 'all' || log.action === actionFilter)),
    [state.auditLogs, userFilter, actionFilter],
  );

  return (
    <AdminLayout title="Registro de auditoría">
      <div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-md">Registro inmutable de todas las acciones del sistema — solo lectura.</p>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md mb-md flex flex-col md:flex-row gap-md items-end">
          <div className="w-full md:w-56">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Usuario</label>
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="all">Usuario: Todos</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-56">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Acción</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as AuditAction | 'all')} className="w-full px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="all">Acción: Todas</option>
              {Object.entries(actionLabel).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase whitespace-nowrap">Fecha y hora</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase whitespace-nowrap">Usuario</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase whitespace-nowrap">Acción</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase whitespace-nowrap">Entidad</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase whitespace-nowrap">Dirección IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md font-body-md">
              {rows.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    className="hover:bg-surface-container-low/50 transition-colors h-[48px] cursor-pointer"
                  >
                    <td className="px-md py-sm whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="px-md py-sm whitespace-nowrap">{log.userEmail}</td>
                    <td className="px-md py-sm whitespace-nowrap">
                      <Pill variant={actionVariant[log.action]}>{actionLabel[log.action]}</Pill>
                    </td>
                    <td className="px-md py-sm whitespace-nowrap">
                      {log.entityType} #{log.entityId}
                      {!!log.diff?.length && <Icon name={expanded === log.id ? 'expand_less' : 'expand_more'} className="text-[16px] align-middle ml-1 text-outline" />}
                    </td>
                    <td className="px-md py-sm whitespace-nowrap text-on-surface-variant text-sm">{log.ipAddress}</td>
                  </tr>
                  {expanded === log.id && !!log.diff?.length && (
                    <tr className="bg-surface-container-low/30 border-b border-outline-variant">
                      <td className="px-md py-md" colSpan={5}>
                        <div className="bg-surface-container-lowest p-sm border border-outline-variant rounded font-mono text-sm space-y-1">
                          {log.diff.map((d, i) => (
                            <div key={i} className="flex items-center gap-sm text-secondary">
                              <Icon name="add" className="text-[16px]" />
                              <span>{d.field}: {String(d.after)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
