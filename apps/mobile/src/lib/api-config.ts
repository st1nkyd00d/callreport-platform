import Constants from 'expo-constants';

// Fase 2: todavía no hay variable de entorno explícita para la URL del
// API (eso llega con EAS Build en la Fase 8). En desarrollo, Expo expone
// el host:puerto del bundler en Constants.expoConfig.hostUri (p.ej.
// "192.168.1.5:8081" cuando se corre `expo start` en la misma red que el
// dispositivo/Expo Go) -- se reusa esa IP LAN para no tener que
// hardcodearla ni pedirle al usuario que la configure a mano.
function resolveApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();
