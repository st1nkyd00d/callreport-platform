import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';

// Cliente de runtime de NestJS -- conecta con APP_DATABASE_URL (rol
// app_user, sujeto a RLS; ver apps/api/.env.example). Regla de código
// (plan.md Fase 2, tarea 2): los servicios de negocio SOLO acceden a la
// DB vía forUser(); llamar a los modelos de este cliente directamente
// salta el contexto RLS. La única excepción legítima es AuthModule
// (login/refresh), que corre ANTES de que exista un usuario autenticado
// y opera sobre tablas sin RLS (users, refresh_tokens).
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.APP_DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Cliente scopeado al usuario autenticado: cada operación de modelo
  // corre dentro de su propia transacción Postgres que primero fija los
  // GUC de sesión que leen las políticas RLS (ver contrato documentado en
  // prisma/migrations/*_enable_rls/migration.sql). El tercer argumento
  // `true` de set_config hace el setting transaction-scoped, seguro con
  // el pooler de Neon (PgBouncer en modo transacción).
  //
  // Importante: dentro del callback de abajo, `this` sigue refiriendo al
  // cliente SIN extender (closure léxica de una arrow function sobre el
  // `this` de forUser()), nunca al cliente que devuelve $extends -- si
  // usara el extendido, cada operación dentro de la transacción volvería
  // a pasar por este mismo interceptor y entraría en recursión infinita.
  forUser(user: RequestUser) {
    return this.$extends({
      name: 'rls-context',
      query: {
        $allOperations: async ({ model, operation, args, query }) => {
          if (!model) {
            // Operaciones sin modelo (p.ej. $queryRaw suelto) no llevan
            // contexto RLS -- el código de negocio no las usa vía forUser().
            return (await query(args)) as unknown;
          }
          return this.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true), set_config('app.role', ${user.role}, true), set_config('app.tenant_id', ${user.tenantId ?? ''}, true)`;
            const txModel = (
              tx as unknown as Record<
                string,
                Record<string, (a: unknown) => unknown>
              >
            )[model];
            return txModel[operation](args);
          });
        },
      },
    });
  }
}
