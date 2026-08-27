// Debe ser el primer import del archivo (Fase 8, D1/D2): tanto
// AuthController (@Throttle con límites leídos de process.env) como
// RealtimeGateway/RealtimeIoAdapter dependen de que las variables de
// CORS_ORIGINS/THROTTLE_* ya estén en process.env cuando esos archivos se
// IMPORTAN -- lo que ocurre al hacer `require('./app.module')` más abajo,
// antes de que ConfigModule.forRoot() llegue a instanciarse. Node ejecuta
// los `require()` en el orden textual en que aparecen, así que esta línea
// tiene que ir antes que cualquier otro import.
import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RealtimeIoAdapter } from './realtime/realtime-io.adapter';

const DEV_CORS_ORIGINS = [
  'http://localhost:5173', // Vite (admin-web)
  'http://localhost:8081', // expo start --web
];

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return DEV_CORS_ORIGINS;
  const list = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEV_CORS_ORIGINS;
}

async function bootstrap() {
  // bufferLogs: los logs que salgan antes de que app.useLogger() abajo
  // reemplace el logger default de Nest por pino no se pierden, quedan en
  // buffer y se vuelcan apenas el logger real está listo.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const corsOrigins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));

  // Fase 8, tarea 1: detrás del proxy de Render, sin esto `req.ip` es la
  // IP del proxy para TODAS las requests -- el throttler (D1) bloquearía
  // a todos los usuarios a la vez apenas uno llegara al límite. Coherente
  // con AuditInterceptor, que ya lee X-Forwarded-For desde la Fase 3.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());

  // exposedHeaders: Content-Disposition no es una cabecera CORS-safelisted
  // por defecto -- sin esto, el JS de admin-web no puede leer el nombre de
  // archivo que manda ExportsController para nombrar la descarga (Fase 7).
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });
  // El gateway de sockets tiene su propia config de CORS, independiente de
  // enableCors() de arriba (Fase 8, D2) -- mismo origen, adapter propio
  // porque las opciones del decorador @WebSocketGateway se evalúan al
  // importar el archivo, antes de que CORS_ORIGINS esté disponible acá.
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, corsOrigins));

  // Tamaño máximo de body (Fase 8, tarea 1): el body más grande que acepta
  // el sistema hoy son las notas de un reporte (5000 caracteres, tope de
  // sanitizeNotes desde la Fase 4) -- 128kb es holgado y corta cualquier
  // intento de agotar memoria con un JSON gigante. No afecta a
  // ExportsController: sus endpoints son GETs que responden en stream, no
  // reciben body.
  app.useBodyParser('json', { limit: '128kb' });
  app.useBodyParser('urlencoded', { limit: '128kb', extended: true });

  // whitelist + forbidNonWhitelisted (plan.md Fase 2, tarea 3): cualquier
  // campo no declarado en el DTO del endpoint (p.ej. un tenant_id
  // inyectado a mano en el body) hace que la request entera falle con
  // 400, en vez de descartarse en silencio.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Fase 8, tarea 2: un redeploy en Render manda SIGTERM -- sin esto el
  // proceso se corta en seco, sockets abiertos y conexiones de Prisma
  // incluidas, en vez de cerrar en orden.
  app.enableShutdownHooks();

  // '0.0.0.0' explícito (Fase 8, D13): sin el segundo argumento, Nest liga
  // el server a localhost -- en Render el health check externo no llega.
  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
