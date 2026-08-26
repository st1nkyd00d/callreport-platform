import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useAdminAuth } from '../../api/auth-context';
import { ApiError } from '../../api/client';

export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/admin/clientes', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-lg gap-xl bg-background">
      <div className="flex flex-col items-center text-center gap-sm">
        <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mb-sm">
          <Icon name="admin_panel_settings" filled className="text-3xl text-on-primary-container" />
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-background">CallReport Admin</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Panel de administración</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md text-on-surface">Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="admin@callreport.demo"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md text-on-surface">Contraseña</label>
          <div className="relative">
            <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline"
            >
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-[20px]" />
            </button>
          </div>
        </div>
        {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-sm py-2 px-4 bg-primary text-on-primary rounded font-label-md text-label-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? 'Ingresando...' : 'Iniciar sesión'}
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      </form>
    </div>
  );
}
