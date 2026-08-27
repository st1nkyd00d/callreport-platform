import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

// Fase 8 (D7): liveness y readiness separados a propósito. Un healthcheck
// que consulte Neon parece más completo, pero en un PaaS es
// contraproducente: si Neon tarda o parpadea, el healthcheck falla, el
// PaaS reinicia el proceso, y un problema de red externo se convierte en
// un loop de reinicios que además tira todos los sockets abiertos.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness -- lo que se configura en el PaaS. Nunca toca la base.
  @Public()
  @Get()
  liveness() {
    return {
      status: 'ok' as const,
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }

  // Readiness -- para diagnóstico y el smoke test post-deploy, no para el
  // PaaS. `$queryRaw` directo (sin forUser/forSystem/forUserRaw a propósito:
  // "SELECT 1" no toca ninguna tabla con RLS, no hay contexto de usuario que
  // fijar) -- ver la allowlist de check-prisma-usage.mjs.
  @Public()
  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error' as const,
        message: 'No se pudo conectar a la base de datos',
      };
    }
  }
}
