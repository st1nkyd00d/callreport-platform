// Fase 8 (D14): sin esto, un typo de variable de entorno en el hosting se
// manifiesta como un 500 raro en runtime (p.ej. `undefined` pasado a Prisma)
// en vez de un fallo de arranque explícito. `ConfigModule.forRoot({ validate })`
// corre esta función una sola vez, al boot, con el merge de `process.env` +
// el `.env` cargado -- si tira, Nest aborta el arranque.
const REQUIRED_ALWAYS = [
  'DATABASE_URL',
  'APP_DATABASE_URL',
  'JWT_ACCESS_SECRET',
];

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ALWAYS.filter((key) => !config[key]);

  // CORS_ORIGINS tiene un fallback de desarrollo (localhost:5173/8081) --
  // ver main.ts#parseCorsOrigins(). En producción ese fallback abriría el
  // API a orígenes de desarrollo, así que ahí sí es obligatoria.
  if (config.NODE_ENV === 'production' && !config.CORS_ORIGINS) {
    missing.push('CORS_ORIGINS');
  }

  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno faltantes: ${missing.join(', ')}. Ver apps/api/.env.example.`,
    );
  }

  return config;
}
