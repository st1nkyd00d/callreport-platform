import { useEffect } from 'react';
import { useAuth } from './auth-context';
import { registerForPushNotifications } from './push';

// Montado en los layouts de (agent) y (client) (Fase 6, plan.md: "pedir
// permiso de notificaciones tras el primer login (no en el arranque)") --
// ambos layouts solo se alcanzan una vez que hay sesión, así que este
// hook nunca corre en la pantalla de login.
export function usePushRegistration(): void {
  const { session, authFetch } = useAuth();

  useEffect(() => {
    if (!session) return;
    void registerForPushNotifications(authFetch);
    // Solo re-registrar si cambia el usuario logueado (mismo dispositivo,
    // otra sesión) -- authFetch cambia de identidad en cada refresh de
    // token (useCallback depende de `session`) y no hace falta pedir
    // permiso de nuevo por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
}
