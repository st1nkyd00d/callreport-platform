import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validateEnv } from './config/env.validation';
import { ExportsModule } from './exports/exports.module';
import { FollowupsModule } from './followups/followups.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReportsModule } from './reports/reports.module';
import { ShiftsModule } from './shifts/shifts.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Fase 8 (D6): logging estructurado con request-id y redacción de
    // datos sensibles. Registrado temprano en el árbol de imports por la
    // misma razón que ThrottlerModule -- no por orden de guards acá, sino
    // para que esté disponible como logger de toda la app (main.ts lo
    // activa con app.useLogger()).
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level:
            config.get<string>('NODE_ENV') === 'test'
              ? 'silent'
              : (config.get<string>('LOG_LEVEL') ?? 'info'),
          genReqId: (req: {
            headers: Record<string, string | string[] | undefined>;
          }): string => {
            const existing = req.headers['x-request-id'];
            const value = Array.isArray(existing) ? existing[0] : existing;
            return value && value.length > 0 ? value : randomUUID();
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body.password',
              'req.body.refreshToken',
              'req.body.token',
            ],
            censor: '[REDACTADO]',
          },
          transport:
            config.get<string>('NODE_ENV') === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
    // Fase 8 (D1): ThrottlerModule se importa ANTES de AuthModule para que
    // su APP_GUARD (abajo, en `providers`) corra antes que JwtAuthGuard/
    // RolesGuard -- más barato, no depende de identidad. skipIf lee
    // THROTTLE_ENABLED de .env: las 10 suites e2e existentes corren con
    // ese flag en false (un límite real de fuerza bruta las rompería,
    // hacen ~35 logins reales por corrida); test/throttler.e2e-spec.ts
    // levanta su propia instancia con el límite encendido para cubrir el
    // criterio de aceptación.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<string>('THROTTLE_ENABLED') !== 'false';
        return {
          throttlers: [
            {
              name: 'default',
              ttl: Number(config.get('THROTTLE_GLOBAL_TTL') ?? 60) * 1000,
              limit: Number(config.get('THROTTLE_GLOBAL_LIMIT') ?? 120),
            },
          ],
          skipIf: () => !enabled,
        };
      },
    }),
    PrismaModule,
    AuthModule,
    AuditModule,
    RealtimeModule,
    NotificationsModule,
    ExportsModule,
    FollowupsModule,
    MetricsModule,
    ReportsModule,
    ShiftsModule,
    TenantsModule,
    UsersModule,
    CampaignsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
