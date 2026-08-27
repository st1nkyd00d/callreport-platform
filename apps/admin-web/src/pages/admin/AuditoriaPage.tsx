import { Fragment, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Pill, type PillVariant } from '../../components/Pill';
import { formatDateTime } from '../../lib/format';
import { useAuditFilterOptions, useAuditLogs, type AuditLogFilters } from '../../api/audit';
import { useUsers } from '../../api/users';

// Fase 7 (plan.md): visor de auditoría real -- se conserva toda la UI del
// prototipo (tabla, pills por acción, fila expandible con el diff) y se
// reemplaza el AppStore mock por /admin/audit-logs (RLS -- audit_logs_
// staff_select -- es el corte real, ver plan-fase-7.md D4). Las acciones
// que el mock listaba (suspend/clock_in/clock_out) nunca las escribe el
// backend real -- el label/variant de una acción desconocida cae a un
// default en vez de asumir el set fijo de @callreport/shared.
const ACTION_LABEL: Record<string, string> = {
  create: 'Creación',
  update: 'Modificación',
  resolve_followup: 'Resolución',
  suspend: 'Suspensión',
  delete: 'Eliminación',
  clock_in: 'Inicio de turno',
  clock_out: 'Fin de turno',
};
const ACTION_VARIANT: Record<string, PillVariant> = {
  create: 'success',
  update: 'warning',
  resolve_followup: 'primary',
  suspend: 'neutral',
  delete: 'error',
  clock_in: 'teal',
  clock_out: 'neutral',
};

export function AuditoriaPage() {
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const usersQuery = useUsers();
  const filterOptionsQuery = useAuditFilterOptions();

  const filters: AuditLogFilters = useMemo(
    () => ({
      userId: userFilter === 'all' ? undefined : userFilter,
      action: actionFilter === 'all' ? undefined : actionFilter,
      entityType: entityFilter === 'all' ? undefined : entityFilter,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    }),
    [userFilter, actionFilter, entityFilter, from, to],
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAuditLogs(filters);
  const rows = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  return (
    <AdminLayout title="Registro de auditoría">
      <div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-md">Registro inmutable de todas las acciones del sistema — solo lectura.</p>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md mb-md flex flex-col md:flex-row gap-md items-end flex-wrap">
          <div className="w-full md:w-56">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Usuario</label>
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="all">Usuario: Todos</option>
              {(usersQuery.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-56">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Acción</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="w-full px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="all">Acción: Todas</option>
              {(filterOptionsQuery.data?.actions ?? []).map((a) => (
                <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-56">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Entidad</label>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-full px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="all">Entidad: Todas</option>
              {(filterOptionsQuery.data?.entityTypes ?? []).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-xs">
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Desde</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md" />
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Hasta</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="px-sm py-sm border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md" />
            </div>
          </div>
        </div>

        {isLoading && (
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-md">Cargando auditoría…</p>
        )}

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
                    <td className="px-md py-sm whitespace-nowrap">{log.user.email}</td>
                    <td className="px-md py-sm whitespace-nowrap">
                      <Pill variant={ACTION_VARIANT[log.action] ?? 'neutral'}>{ACTION_LABEL[log.action] ?? log.action}</Pill>
                    </td>
                    <td className="px-md py-sm whitespace-nowrap">
                      {log.entityType} #{log.entityId}
                      {!!log.diff?.length && <Icon name={expanded === log.id ? 'expand_less' : 'expand_more'} className="text-[16px] align-middle ml-1 text-outline" />}
                    </td>
                    <td className="px-md py-sm whitespace-nowrap text-on-surface-variant text-sm">{log.ipAddress ?? '—'}</td>
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
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td className="px-md py-lg text-center text-on-surface-variant font-body-sm text-body-sm" colSpan={5}>
                    No hay eventos para estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasNextPage && (
          <div className="flex justify-center mt-md">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="px-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md rounded shadow-sm hover:bg-surface-container transition-colors disabled:opacity-60"
            >
              {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
