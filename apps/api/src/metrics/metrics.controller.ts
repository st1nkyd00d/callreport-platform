import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { MetricsService } from './metrics.service';
import type { MetricsRange } from './metrics.service';

function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} no es una fecha válida`);
  }
  return d;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Valida el nombre de zona horaria construyendo un formateador -- evita
// mandar un tz arbitrario a `AT TIME ZONE` en Postgres (que respondería
// con un error de base de datos, no un 400 claro). Intl.supportedValuesOf
// NO sirve acá: solo lista IDs canónicos (p.ej. 'America/Buenos_Aires'),
// no alias válidos como 'America/Argentina/Buenos_Aires' que Postgres sí
// acepta -- DateTimeFormat, en cambio, resuelve alias.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Controller('admin/metrics')
@Roles(Role.supervisor, Role.super_admin)
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly config: ConfigService,
  ) {}

  private resolveRange(from?: string, to?: string, tz?: string): MetricsRange {
    const resolvedTz = tz ?? this.config.get<string>('METRICS_TZ') ?? 'UTC';
    if (!isValidTimeZone(resolvedTz)) {
      throw new BadRequestException(`tz inválido: ${resolvedTz}`);
    }
    return {
      // Default de 30 días (plan.md no fija uno explícito para estos
      // endpoints) -- admin-web manda from/to siempre desde el selector
      // de rango, este default es solo para pegarle al endpoint a mano.
      from: parseDate(from, 'from') ?? daysAgo(30),
      to: parseDate(to, 'to') ?? new Date(),
      tz: resolvedTz,
    };
  }

  @Get('agents')
  agents(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string,
  ) {
    return this.metricsService.agents(user, this.resolveRange(from, to, tz));
  }

  @Get('overview')
  overview(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string,
  ) {
    return this.metricsService.overview(user, this.resolveRange(from, to, tz));
  }
}
