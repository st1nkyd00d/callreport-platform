import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { Toast } from '../../../components/Toast';
import { useStore } from '../../../store/AppStore';
import { agentTabs } from '../../../lib/tabs';
import { openShiftFor } from '../../../lib/selectors';

const iconTextColor: Record<string, string> = {
  success: 'text-secondary',
  warning: 'text-[#f59e0b]',
  error: 'text-error',
  primary: 'text-primary',
  purple: 'text-purple-600',
  teal: 'text-teal-600',
  neutral: 'text-on-surface-variant',
};

export function NuevoReportePage() {
  const { state, currentUser, createReport, clockIn } = useStore();
  const navigate = useNavigate();
  const campaign = state.campaigns.find((c) => c.id === state.session.agentCampaignId);
  const tenant = campaign ? state.tenants.find((t) => t.id === campaign.tenantId) : undefined;
  const dispositions = state.dispositions.filter((d) => d.campaignId === campaign?.id && d.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const openShift = currentUser ? openShiftFor(state, currentUser.id) : undefined;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dispositionId, setDispositionId] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [detailText, setDetailText] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!campaign || !tenant || !currentUser) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-md p-lg text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">Selecciona una campaña para comenzar a reportar.</p>
        <button onClick={() => navigate('/mobile/agente/seleccionar-campana')} className="px-4 py-2 bg-primary text-on-primary rounded font-label-md text-label-md">
          Elegir campaña
        </button>
      </div>
    );
  }

  const selectedDisposition = dispositions.find((d) => d.id === dispositionId);

  function selectDisposition(id: string) {
    setDispositionId(id);
    setScheduledAt('');
    setDetailText('');
    setScheduleError(false);
    setDetailError(false);
  }

  function handleSave() {
    const validPhone = /^[0-9+\-\s]{7,}$/.test(phone.trim());
    if (!validPhone) {
      setPhoneError(true);
      return;
    }
    if (!name.trim() || !dispositionId) return;
    if (selectedDisposition?.requiresSchedule && !scheduledAt) {
      setScheduleError(true);
      return;
    }
    if (selectedDisposition?.requiresSchedule && new Date(scheduledAt).getTime() <= Date.now()) {
      setScheduleError(true);
      return;
    }
    if (selectedDisposition?.requiresDetail && !detailText.trim()) {
      setDetailError(true);
      return;
    }
    const created = createReport({
      campaignId: campaign!.id,
      dispositionId,
      contactName: name.trim(),
      contactPhone: phone.trim(),
      contactEmail: email.trim() || undefined,
      notes: notes.trim(),
      scheduledAt: selectedDisposition?.requiresSchedule ? new Date(scheduledAt).toISOString() : undefined,
      detailText: selectedDisposition?.requiresDetail ? detailText.trim() : undefined,
    });
    if (!created) {
      setToast('Inicia tu turno para registrar llamadas');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    setName('');
    setPhone('');
    setEmail('');
    setDispositionId('');
    setNotes('');
    setScheduledAt('');
    setDetailText('');
    setPhoneError(false);
    setScheduleError(false);
    setDetailError(false);
    setToast('Reporte guardado');
    setTimeout(() => setToast(null), 2000);
  }

  return (
    <div className="h-full flex flex-col relative">
      <header className="w-full flex items-center justify-between px-md py-sm bg-surface border-b border-outline-variant h-14 shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="menu" className="text-primary" />
          <h1 className="font-headline-sm text-headline-sm text-primary">CallReport</h1>
        </div>
        <button
          onClick={() => navigate('/mobile/agente/seleccionar-campana')}
          className="flex items-center bg-surface-container-low rounded-full px-3 py-1 border border-outline-variant/50"
        >
          <span className="font-label-sm text-label-sm text-on-surface-variant truncate max-w-[120px]">{tenant.name} — {campaign.name}</span>
          <Icon name="swap_horiz" className="text-on-surface-variant text-[16px] ml-1" />
        </button>
      </header>

      {!openShift && (
        <div className="mx-md mt-md bg-tertiary-fixed/20 border border-tertiary-fixed-dim/40 rounded-xl p-md flex flex-col items-center gap-sm text-center">
          <Icon name="punch_clock" filled className="text-tertiary-container text-[28px]" />
          <p className="font-label-md text-label-md text-on-surface">Inicia tu turno para registrar llamadas</p>
          <button
            onClick={clockIn}
            className="w-full bg-primary text-on-primary font-label-md text-label-md rounded-lg py-2 flex items-center justify-center gap-2"
          >
            <Icon name="play_circle" className="text-[18px]" /> Iniciar turno
          </button>
        </div>
      )}

      <main className={`px-md py-4 flex-1 overflow-y-auto hide-scrollbar pb-32 ${!openShift ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="space-y-6 max-w-lg mx-auto">
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm">
            <h2 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
              <Icon name="person" className="text-[18px]" /> Datos del contacto
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-outline-variant rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md" placeholder="Nombre completo" />
              </div>
              <div>
                <label className={`block font-label-sm text-label-sm mb-1 ${phoneError ? 'text-error' : 'text-on-surface-variant'}`}>Teléfono</label>
                <input
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 font-body-md text-body-md ${phoneError ? 'border-error focus:ring-error' : 'border-outline-variant focus:ring-primary'}`}
                  placeholder="Ej: 555-0123"
                  type="tel"
                />
                {phoneError && (
                  <p className="text-error font-body-sm text-body-sm mt-1 flex items-center gap-1">
                    <Icon name="error" filled className="text-[14px]" /> Ingresa un teléfono válido
                  </p>
                )}
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Correo (opcional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-outline-variant rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md" placeholder="ejemplo@correo.com" type="email" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-label-md text-label-md text-on-surface mb-3 px-1">Tipificación</h2>
            <div className="grid grid-cols-2 gap-2">
              {dispositions.map((d) => {
                const selected = dispositionId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => selectDisposition(d.id)}
                    className={`border rounded-lg p-3 text-center transition-colors ${selected ? 'bg-primary-container border-primary text-on-primary-container' : 'bg-surface-container-lowest border-outline-variant'}`}
                  >
                    <Icon name={d.icon ?? 'label'} filled className={`mb-1 block mx-auto ${iconTextColor[d.color ?? 'neutral']}`} />
                    <span className="font-label-sm text-label-sm">{d.label}</span>
                  </button>
                );
              })}
            </div>

            {selectedDisposition?.requiresSchedule && (
              <div className="mt-4">
                <label className={`block font-label-sm text-label-sm mb-1 ${scheduleError ? 'text-error' : 'text-on-surface-variant'}`}>Fecha y hora de la cita</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => { setScheduledAt(e.target.value); setScheduleError(false); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 font-body-md text-body-md ${scheduleError ? 'border-error focus:ring-error' : 'border-outline-variant focus:ring-primary'}`}
                />
                {scheduleError && (
                  <p className="text-error font-body-sm text-body-sm mt-1 flex items-center gap-1">
                    <Icon name="error" filled className="text-[14px]" /> Elige una fecha y hora futuras
                  </p>
                )}
              </div>
            )}

            {selectedDisposition?.requiresDetail && (
              <div className="mt-4">
                <label className={`block font-label-sm text-label-sm mb-1 ${detailError ? 'text-error' : 'text-on-surface-variant'}`}>Especificar</label>
                <input
                  value={detailText}
                  onChange={(e) => { setDetailText(e.target.value); setDetailError(false); }}
                  maxLength={120}
                  className={`w-full border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 font-body-md text-body-md ${detailError ? 'border-error focus:ring-error' : 'border-outline-variant focus:ring-primary'}`}
                  placeholder="¿De qué se trató la llamada?"
                />
                {detailError && (
                  <p className="text-error font-body-sm text-body-sm mt-1 flex items-center gap-1">
                    <Icon name="error" filled className="text-[14px]" /> Este campo es obligatorio
                  </p>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-label-md text-label-md text-on-surface mb-2 px-1">Notas de la llamada</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-outline-variant rounded-xl p-3 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md resize-none h-32" placeholder="Detalles de la interacción..." />
          </section>
        </div>
      </main>

      <div className="fixed-bottom-btn absolute bottom-[64px] left-0 w-full px-md py-sm bg-gradient-to-t from-background to-transparent z-40">
        <button onClick={handleSave} disabled={!openShift} className="w-full bg-primary text-on-primary font-label-md text-label-md rounded-lg py-3 flex items-center justify-center gap-2 shadow-sm active:opacity-80 transition-opacity disabled:opacity-50">
          <Icon name="save" className="text-[20px]" /> Guardar reporte
        </button>
      </div>
      <BottomTabBar items={agentTabs} active="/mobile/agente/nuevo-reporte" />
      <Toast message={toast} position="top" />
    </div>
  );
}
