import Constants from 'expo-constants';

// Fase 8 (D11): precedencia explícita
//   EXPO_PUBLIC_API_URL (env)  ->  hostUri (desarrollo)  ->  localhost (último recurso)
//
// Un build de producción (EAS Build, Fase 9) no tiene bundler de Metro
// corriendo -- Constants.expoConfig.hostUri es undefined ahí, y sin esta
// variable la app caería al fallback de "localhost:3000", conectándose a
// sí misma. El prefijo EXPO_PUBLIC_ hace que Expo la inyecte en el bundle
// en build time (ver apps/mobile/.env.example); en desarrollo se deja sin
// setear y se sigue usando la heurística de hostUri de la Fase 2 (la IP
// LAN del bundler, para no tener que hardcodearla).
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();
