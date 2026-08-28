import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type * as ExpoNotifications from 'expo-notifications';
import { useAuth } from './auth-context';
import { loadNotifications } from './push';

interface PushData {
  type?: string;
  reportId?: string;
}

// Fase 6 (plan.md): "tocar la notificación abre el detalle del reporte
// (deep link con Expo Router)". Cubre los tres casos: app en primer
// plano/background (addNotificationResponseReceivedListener) y arranque
// en frío (getLastNotificationResponseAsync) -- Expo puede entregar la
// MISMA respuesta por ambos caminos en frío, así que se dedupe por el
// identifier de la notificación antes de navegar dos veces.
//
// Fase 8.5: reusa loadNotifications() de push.ts (carga perezosa, se
// salta el import por completo en Expo Go -- ver el comentario largo
// ahí para el bug real que esto evita). Por eso acá también se
// reimplementa a mano el equivalente de
// Notifications.useLastNotificationResponse() (un simple
// getLastNotificationResponseAsync() en el mismo efecto) en vez de usar
// el hook empaquetado: un hook no se puede cargar perezosamente sin
// violar las Rules of Hooks.
export function useNotificationDeepLink(): void {
  const router = useRouter();
  const { session } = useAuth();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    function navigate(response: ExpoNotifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      if (handledId.current === id) return;
      handledId.current = id;

      const data = response.notification.request.content.data as PushData;
      // Solo el dashboard del cliente tiene una pantalla de detalle de
      // reporte -- push a supervisores ("Seguimiento pendiente") no tiene
      // destino en el móvil todavía, admin-web es su superficie real.
      if (data?.type === 'report.created' && data.reportId && session?.user.role === 'client_user') {
        router.push({ pathname: '/(client)/reporte/[id]', params: { id: data.reportId } });
      }
    }

    void (async () => {
      const Notifications = await loadNotifications();
      if (!Notifications || cancelled) return;

      subscription = Notifications.addNotificationResponseReceivedListener(navigate);
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && lastResponse) navigate(lastResponse);
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router, session]);
}
