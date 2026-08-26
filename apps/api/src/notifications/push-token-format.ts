// Réplica exacta de Expo.isExpoPushToken (expo-server-sdk) sin importar el
// paquete a nivel de módulo. expo-server-sdk v7 es ESM puro; Jest (Node
// 22 en este entorno, sin el soporte de require(ESM) síncrono que recién
// llega en Node 24.9) no puede cargar un `import` estático de ese
// paquete -- y NotificationsModule (con este DTO) cuelga de AppModule,
// que TODAS las suites e2e cargan. Duplicar esta función evita que el
// grafo de módulos dependa de esa carga estática; PushService sí usa el
// SDK real para enviar, pero vía import() dinámico diferido (ver
// push.service.ts) -- mismo patrón que ya usa el motor WASM de Prisma en
// este proyecto (test:e2e corre con NODE_OPTIONS=--experimental-vm-modules
// por esa misma razón).
export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
      token.endsWith(']')) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}
