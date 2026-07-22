import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { useStore } from '../../../store/AppStore';
import { dispositionById, isPendingFollowup, userById } from '../../../lib/selectors';
import { formatDateLong, formatTime, initials } from '../../../lib/format';

export function DetalleReportePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, resolveFollowup } = useStore();
  const report = state.reports.find((r) => r.id === id);

  if (!report) {
    return (
      <div className="h-full flex flex-col">
        <MobileTopBar title="Detalle del reporte" onBack />
        <div className="p-lg text-center font-body-md text-body-md text-on-surface-variant">Reporte no encontrado.</div>
      </div>
    );
  }

  const disposition = dispositionById(state, report.dispositionId);
  const campaign = state.campaigns.find((c) => c.id === report.campaignId);
  const agent = userById(state, report.agentId);
  const pending = isPendingFollowup(state, report);

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="Detalle del reporte" onBack />
      <main className="flex-1 overflow-y-auto hide-scrollbar p-md space-y-md pb-24">
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
          <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-sm">Contacto</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline-sm text-headline-sm">
                {initials(report.contactName)}
              </div>
              <div>
                <h3 className="font-label-md text-label-md text-on-surface">{report.contactName}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{report.contactEmail ?? 'Sin correo registrado'}</p>
              </div>
            </div>
            <div className="flex gap-sm">
              <a aria-label="Llamar" href={`tel:${report.contactPhone}`} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-colors">
                <Icon name="call" />
              </a>
              {report.contactEmail && (
                <a aria-label="Enviar correo" href={`mailto:${report.contactEmail}`} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-colors">
                  <Icon name="mail" />
                </a>
              )}
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
          <div className="flex justify-between items-start mb-md">
            <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase">Detalles de la llamada</h2>
            <div className={`px-2 py-1 rounded-full flex items-center gap-1 border ${pending ? 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20' : 'bg-secondary/10 text-secondary border-secondary/20'}`}>
              <Icon name={pending ? 'schedule' : 'check_circle'} filled className="text-[14px]" />
              <span className="font-label-sm text-[10px] uppercase">{disposition?.label}</span>
            </div>
          </div>
          <div className="space-y-sm">
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-xs">{campaign?.name}</h3>
              <div className="flex items-center gap-xs text-on-surface-variant font-body-sm text-body-sm">
                <Icon name="calendar_today" className="text-[16px]" />
                <span>{formatDateLong(report.createdAt)}, {formatTime(report.createdAt)}</span>
              </div>
            </div>
            <div className="pt-sm border-t border-outline-variant/50 flex justify-between items-center">
              <span className="font-body-sm text-body-sm text-on-surface-variant">Atendió:</span>
              <div className="flex items-center gap-xs">
                <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant font-label-sm text-[10px]">{agent ? initials(agent.fullName) : '--'}</div>
                <span className="font-label-md text-label-md text-on-surface">{agent?.fullName ?? 'Agente'}</span>
              </div>
            </div>
            {report.durationSeconds && (
              <div className="flex justify-between items-center">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Duración:</span>
                <span className="font-label-md text-label-md text-on-surface">{Math.floor(report.durationSeconds / 60)}m {report.durationSeconds % 60}s</span>
              </div>
            )}
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
          <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-sm">Notas de la llamada</h2>
          <div className="bg-surface-container-low p-sm rounded-lg">
            <p className="font-body-md text-body-md text-on-surface">{report.notes || 'Sin notas registradas.'}</p>
          </div>
        </section>
      </main>

      {pending && (
        <div className="absolute bottom-0 left-0 w-full p-md bg-surface border-t border-outline-variant shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-40">
          <button
            onClick={() => {
              resolveFollowup(report.id);
              navigate(-1);
            }}
            className="w-full bg-tertiary-container hover:bg-tertiary text-on-tertiary-container font-label-md text-label-md py-sm px-md rounded-full flex items-center justify-center gap-sm transition-colors shadow-sm"
          >
            <Icon name="check_circle" /> Marcar seguimiento como resuelto
          </button>
        </div>
      )}
    </div>
  );
}
