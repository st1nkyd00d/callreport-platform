import Constants, { AppOwnership } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authJson } from './api-json';
import type { AuthFetch } from './api-json';
import { API_BASE_URL } from './api-config';
import type * as ExpoNotifications from 'expo-notifications';

// Fase 8.5 (bug real encontrado corriendo en Expo Go/Android de verdad,
// no solo headless): con SDK 53+, el propio 'expo-notifications' instala
// un side-effect a nivel de módulo (node_modules/expo-notifications/build/
// registerTaskManager/AutoRegistration.fx.js, corre apenas se lo importa,
// no al llamar ninguna función nuestra) que en Android/Expo Go llama
// warnOfExpoGoPushUsage() -- que hace `throw new Error(...)`. Ese throw
// ocurre DENTRO del require interno de Metro al resolver el módulo, no
// dentro de una promesa que un try/catch propio pueda atajar de forma
// confiable (un `import * as Notifications from 'expo-notifications'`
// estático además se resuelve -hoisted- ANTES que cualquier código de
// este archivo). Como este archivo se importa desde el _layout raíz, la
// excepción tumbaba la evaluación de TODA la app: cada ruta quedaba sin
// su export default y la app no arrancaba, ni siquiera hasta el login.
//
// Fix real: nunca importar 'expo-notifications' en absoluto cuando se
// corre dentro de Expo Go (Constants.appOwnership === 'expo' -- API
// marcada deprecated en favor de executionEnvironment, pero es la única
// que distingue "Expo Go" de "development build" con expo-dev-client;
// executionEnvironment agrupa ambos bajo StoreClient y un dev build SÍ
// tiene push nativo real). Memoizado -- mismo patrón de carga perezosa
// que ya usa el backend para expo-server-sdk (ver PROGRESS.md Fase 6).
let notificationsModule: typeof ExpoNotifications | null | undefined;

export async function loadNotifications(): Promise<typeof ExpoNotifications | null> {
  if (notificationsModule !== undefined) return notificationsModule;
  if (Constants.appOwnership === AppOwnership.Expo) {
    console.log('[push] Expo Go no soporta notificaciones nativas -- omitido.');
    notificationsModule = null;
    return notificationsModule;
  }
  try {
    notificationsModule = await import('expo-notifications');
  } catch (err) {
    console.log('[push] expo-notifications no disponible en este entorno:', err);
    notificationsModule = null;
  }
  return notificationsModule;
}

// Configuración global de cómo se muestra una notificación con la app en
// primer plano -- efecto de módulo a propósito (se importa desde el
// _layout raíz, que carga siempre), no depende de sesión ni de rol.
void (async () => {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
})();

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

  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
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
