import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Abierto por ahora -- admin-web corre en otro origen (Vite dev server)
  // y necesita llamar a esta API desde el navegador (Fase 3). Restringir
  // al dominio real de producción es tarea explícita de Fase 8 (que
  // también tiene que preservar este exposedHeaders al restringir el
  // origen -- ver plan-fase-7.md D6).
  // exposedHeaders: Content-Disposition no es una cabecera CORS-safelisted
  // por defecto -- sin esto, el JS de admin-web no puede leer el nombre
  // de archivo que manda ExportsController para nombrar la descarga.
  app.enableCors({ exposedHeaders: ['Content-Disposition'] });
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
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
