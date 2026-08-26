import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useAuth } from './auth-context';

interface PushData {
  type?: string;
  reportId?: string;
}

// Fase 6 (plan.md): "tocar la notificación abre el detalle del reporte
// (deep link con Expo Router)". Cubre los tres casos: app en primer
// plano/background (addNotificationResponseReceivedListener) y arranque
// en frío (useLastNotificationResponse) -- Expo puede entregar la MISMA
// respuesta por ambos caminos en frío, así que se dedupe por el
// identifier de la notificación antes de navegar dos veces.
export function useNotificationDeepLink(): void {
  const router = useRouter();
  const { session } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    function navigate(response: Notifications.NotificationResponse) {
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

    const subscription = Notifications.addNotificationResponseReceivedListener(navigate);
    if (lastResponse) navigate(lastResponse);
    return () => subscription.remove();
  }, [router, session, lastResponse]);
}
