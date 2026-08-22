import { useState } from 'react';
import { Icon } from './Icon';
import { Pill } from './Pill';
import { useStore } from '../store/AppStore';
import { dispositionById, dispositionPillVariant, isPendingFollowup, userById } from '../lib/selectors';
import { formatAppointment, formatDateLong, formatTime, initials, relativeTime } from '../lib/format';

function barColorFor(variant: string): string {
  switch (variant) {
    case 'success':
      return 'bg-secondary';
    case 'warning':
      return 'bg-tertiary-container';
    case 'error':
      return 'bg-error';
    case 'primary':
      return 'bg-primary';
    case 'teal':
      return 'bg-teal-500';
    case 'purple':
      return 'bg-purple-500';
    default:
      return 'bg-outline';
  }
}

// Tarjeta densa de reporte, compartida por el dashboard del cliente y la
// cola de seguimientos: todo lo relevante se ve sin tocar nada; un tap
// expande in-place (sin navegar) para ver notas completas, correo, agente
// y duración. Llamar, escribir y resolver seguimiento son acciones
// inline -- no requieren ir al detalle.
export function ReportCard({ reportId, highlighted, overdue }: { reportId: string; highlighted?: boolean; overdue?: boolean }) {
  const { state, resolveFollowup } = useStore();
  const [expanded, setExpanded] = useState(false);
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return null;

  const disposition = dispositionById(state, report.dispositionId);
  const campaign = state.campaigns.find((c) => c.id === report.campaignId);
  const agent = userById(state, report.agentId);
  const pending = isPendingFollowup(state, report);
  const variant = dispositionPillVariant(disposition?.color);

  return (
    <div className={`bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm relative ${highlighted ? 'animate-pulse-subtle ring-2 ring-primary' : ''}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${barColorFor(variant)}`} />
      <div className="pl-[14px] pr-sm py-sm flex flex-col gap-xs">
        <div className="flex items-center justify-between gap-sm">
          <div className="flex items-center gap-xs min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">{relativeTime(report.createdAt)}</span>
            <span className="font-body-sm text-body-sm text-outline">·</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant truncate">{campaign?.name}</span>
          </div>
          <Pill variant={variant} className="shrink-0">
            <Icon name={disposition?.icon ?? 'label'} className="text-[14px]" /> {disposition?.label}
          </Pill>
        </div>

        <button onClick={() => setExpanded((v) => !v)} className="flex items-start justify-between gap-sm text-left">
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface truncate">{report.contactName}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{report.contactPhone}</p>
            {!expanded && (
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">{report.notes || 'Sin notas registradas.'}</p>
            )}
          </div>
          <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-on-surface-variant shrink-0 mt-1" />
        </button>

        {(report.scheduledAt || report.detailText) && (
          <div className="flex flex-col gap-0.5">
            {report.scheduledAt && (
              <span className={`font-body-sm text-body-sm flex items-center gap-1 ${overdue ? 'text-error' : 'text-teal-700'}`}>
                <Icon name={overdue ? 'event_busy' : 'event_available'} className="text-[14px]" /> Cita: {formatAppointment(report.scheduledAt)}
                {overdue ? ' · Vencida' : ''}
              </span>
            )}
            {report.detailText && <span className="font-body-sm text-body-sm text-purple-700">Otro: {report.detailText}</span>}
          </div>
        )}

        {expanded && (
          <div className="mt-xs pt-xs border-t border-outline-variant/50 flex flex-col gap-xs">
            <p className="font-body-md text-body-md text-on-surface">{report.notes || 'Sin notas registradas.'}</p>
            <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>{report.contactEmail ?? 'Sin correo registrado'}</span>
              <span>{formatDateLong(report.createdAt)}, {formatTime(report.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-surface-container flex items-center justify-center text-[9px]">{agent ? initials(agent.fullName) : '--'}</span>
                {agent?.fullName ?? 'Agente'}
              </span>
              {report.durationSeconds != null && (
                <span>{Math.floor(report.durationSeconds / 60)}m {report.durationSeconds % 60}s</span>
              )}
            </div>
            <p className="font-body-sm text-body-sm text-outline">ID: {report.id}</p>
          </div>
        )}

        <div className="flex items-center gap-xs mt-xs">
          <a
            href={`tel:${report.contactPhone}`}
            aria-label="Llamar"
            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-colors"
          >
            <Icon name="call" className="text-[16px]" />
          </a>
          {report.contactEmail && (
            <a
              href={`mailto:${report.contactEmail}`}
              aria-label="Enviar correo"
              className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-colors"
            >
              <Icon name="mail" className="text-[16px]" />
            </a>
          )}
          {pending && (
            <button
              onClick={() => resolveFollowup(report.id)}
              title="Marcar seguimiento como resuelto"
              className="w-8 h-8 rounded-full border border-outline-variant flex items-center justify-center text-outline hover:bg-secondary hover:text-on-secondary hover:border-secondary transition-colors ml-auto"
            >
              <Icon name="check" className="text-[16px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
