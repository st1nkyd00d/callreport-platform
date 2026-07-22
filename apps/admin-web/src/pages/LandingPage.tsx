import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-lg">
      <div className="max-w-2xl w-full text-center space-y-xl">
        <div className="flex flex-col items-center gap-sm">
          <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center">
            <Icon name="headset_mic" filled className="text-3xl text-on-primary-container" />
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-background">CallReport</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md">
            Demo interactiva del producto — Fase 1: esqueleto navegable con datos de ejemplo editables. Sin backend real todavía.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <button
            onClick={() => navigate('/admin/metricas')}
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg text-left hover:border-primary transition-colors shadow-sm"
          >
            <Icon name="dashboard" className="text-primary text-[28px] mb-sm" />
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-xs">Panel Admin (Web)</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Métricas, clientes, campañas, usuarios y auditoría.</p>
          </button>
          <button
            onClick={() => navigate('/mobile/login')}
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg text-left hover:border-primary transition-colors shadow-sm"
          >
            <Icon name="smartphone" className="text-primary text-[28px] mb-sm" />
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-xs">App móvil (Agente / Cliente)</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Simulada en un marco de teléfono dentro del navegador.</p>
          </button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Usa el botón flotante inferior derecho para cambiar de rol/usuario en cualquier momento.
        </p>
      </div>
    </div>
  );
}
