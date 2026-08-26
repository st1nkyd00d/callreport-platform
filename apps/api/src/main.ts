import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Abierto por ahora -- admin-web corre en otro origen (Vite dev server)
  // y necesita llamar a esta API desde el navegador (Fase 3). Restringir
  // al dominio real de producción es tarea explícita de Fase 8.
  app.enableCors();
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
