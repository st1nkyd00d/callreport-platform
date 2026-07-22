import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store/AppStore';

const landingByRole: Record<string, string> = {
  super_admin: '/admin/metricas',
  supervisor: '/admin/metricas',
  agent: '/mobile/agente/seleccionar-campana',
  client_user: '/mobile/cliente/dashboard',
};

export function LoginPage() {
  const { state, switchUser } = useStore();
  const navigate = useNavigate();
  const loginable = state.users.filter((u) => u.role === 'agent' || u.role === 'client_user');
  const [userId, setUserId] = useState(loginable[0]?.id ?? '');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const user = state.users.find((u) => u.id === userId);
    if (!user) return;
    switchUser(user.id);
    navigate(landingByRole[user.role]);
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-lg gap-xl">
      <div className="flex flex-col items-center text-center gap-sm">
        <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mb-sm">
          <Icon name="headset_mic" filled className="text-3xl text-on-primary-container" />
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-background">CallReport</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Reportes de llamadas en tiempo real</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md text-on-surface">Usuario demo</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md"
          >
            <optgroup label="Agentes">
              {loginable.filter((u) => u.role === 'agent').map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </optgroup>
            <optgroup label="Clientes">
              {loginable.filter((u) => u.role === 'client_user').map((u) => (
                <option key={u.id} value={u.id}>{u.fullName} — {state.tenants.find((t) => t.id === u.tenantId)?.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md text-on-surface">Contraseña</label>
          <div className="relative">
            <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type={showPassword ? 'text' : 'password'}
              defaultValue="demo1234"
              className="w-full pl-10 pr-10 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md outline-none"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline">
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-[20px]" />
            </button>
          </div>
        </div>
        <button type="submit" className="w-full mt-sm py-2 px-4 bg-primary text-on-primary rounded font-label-md text-label-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          Iniciar sesión
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      </form>
      <p className="text-center font-body-sm text-body-sm text-on-surface-variant -mt-md">
        Demo sin backend: elige un usuario de la lista para simular su sesión.
      </p>
    </div>
  );
}
