import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { authJson } from './api-json';
import type { AuthFetch } from './api-json';
import { API_BASE_URL } from './api-config';

// Configuración global de cómo se muestra una notificación con la app en
// primer plano -- efecto de módulo a propósito (se importa desde el
// _layout raíz, que carga siempre), no depende de sesión ni de rol.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Fase 6 (plan.md): registro del token de push. Se llama desde
// usePushRegistration() (push-hooks.ts), montado en los layouts de
// (agent)/(client) DESPUÉS de que hay sesión -- "pedir permiso de
// notificaciones tras el primer login, no en el arranque".
//
// D5 (plan-fase-6.md, bloqueador conocido): getExpoPushTokenAsync() exige
// un projectId de EAS real (app.json: extra.eas.projectId, hoy vacío --
// hace falta correr `npx eas init` una vez con la cuenta de Expo del
// proyecto) y, desde el SDK 53, Expo Go ya no entrega push remoto en
// Android -- hace falta un development build (`eas build --profile
// development`) para probar el envío real a un dispositivo. Sin
// projectId, o corriendo en Expo Go, esta función es un no-op silencioso
// con un log -- nunca rompe la app.
let lastRegisteredToken: string | null = null;

function resolveProjectId(): string | undefined {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  return projectId ? projectId : undefined;
}

export async function registerForPushNotifications(authFetch: AuthFetch): Promise<void> {
  if (!Device.isDevice) {
    console.log('[push] Sin dispositivo físico (simulador/web) -- omitido.');
    return;
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    console.log(
      '[push] Falta extra.eas.projectId en app.json (correr `npx eas init`) -- omitido.',
    );
    return;
  }

  if (Platform.OS === 'android') {
    // Android 13 exige crear el canal ANTES de pedir el token (ver
    // plan-fase-6.md, docs de expo-notifications v57).
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[push] Permiso de notificaciones denegado -- omitido.');
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await authJson(authFetch, 'POST', '/push/register', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    lastRegisteredToken = token;
  } catch (err) {
    console.log('[push] No se pudo registrar el token:', err);
  }
}

// Fase 6 (D7, plan-fase-6.md): sin esto, si un client_user de un tenant
// cierra sesión y otro usuario entra en el mismo teléfono, el dispositivo
// seguiría recibiendo push del tenant anterior. Solo puede dar de baja el
// token que ESTA sesión llegó a registrar (lastRegisteredToken) -- si
// nunca se registró ninguno (permiso denegado, sin EAS, etc.) no hay nada
// que hacer.
//
// Recibe el accessToken directo (no authFetch/useAuth()): se llama desde
// AuthProvider.logout() ANTES de limpiar la sesión, mismo patrón best-
// effort que api.logoutRequest() en api-client.ts -- una falla acá nunca
// debe impedir que el logout local siga adelante.
export async function unregisterPushToken(accessToken: string): Promise<void> {
  if (!lastRegisteredToken) return;
  const token = lastRegisteredToken;
  lastRegisteredToken = null;
  try {
    await fetch(`${API_BASE_URL}/push/register`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.log('[push] No se pudo dar de baja el token:', err);
  }
}
