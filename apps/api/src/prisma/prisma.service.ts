import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { Role } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';

interface RlsContext {
  userId: string;
  role: Role;
  tenantId?: string;
}

// Cliente de runtime de NestJS -- conecta con APP_DATABASE_URL (rol
// app_user, sujeto a RLS; ver apps/api/.env.example). Regla de código
// (plan.md Fase 2, tarea 2): los servicios de negocio SOLO acceden a la
// DB vía forUser()/forSystem()/forUserRaw(); llamar a los modelos de este
// cliente directamente salta el contexto RLS. La única excepción legítima
// es AuthModule (login/refresh), que corre ANTES de que exista un usuario
// autenticado y opera sobre tablas sin RLS (users, refresh_tokens).
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

  // Cliente scopeado al contexto dado: cada operación de modelo corre
  // dentro de su propia transacción Postgres que primero fija los GUC de
  // sesión que leen las políticas RLS (ver contrato documentado en
  // prisma/migrations/*_enable_rls/migration.sql). El tercer argumento
  // `true` de set_config hace el setting transaction-scoped, seguro con
  // el pooler de Neon (PgBouncer en modo transacción).
  //
  // Importante: dentro del callback de abajo, `this` sigue refiriendo al
  // cliente SIN extender (closure léxica de una arrow function sobre el
  // `this` de withContext()), nunca al cliente que devuelve $extends -- si
  // usara el extendido, cada operación dentro de la transacción volvería
  // a pasar por este mismo interceptor y entraría en recursión infinita.
  private withContext(ctx: RlsContext) {
    return this.$extends({
      name: 'rls-context',
      query: {
        $allOperations: async ({ model, operation, args, query }) => {
          if (!model) {
            // Operaciones sin modelo (p.ej. $queryRaw suelto) no llevan
            // contexto RLS -- el código de negocio no las usa vía este
            // extends para eso, ver forUserRaw() más abajo.
            return (await query(args)) as unknown;
          }
          return this.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true), set_config('app.role', ${ctx.role}, true), set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true)`;
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

  // Cliente scopeado al usuario autenticado -- el 99% de los accesos a
  // datos de la app pasan por acá.
  forUser(user: RequestUser) {
    return this.withContext({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
    });
  }

  // Contexto de sistema para trabajo de fondo sin un usuario HTTP detrás
  // (Fase 6: NotificationsService necesita resolver los client_user/
  // supervisores de un tenant para el targeting de push -- bajo
  // forUser(agente) esas tablas devuelven cero filas porque el agente no
  // tiene ninguna política ahí). Reutiliza las políticas *_staff_all ya
  // existentes fijando app.role='super_admin'; no crea un rol de Postgres
  // nuevo ni políticas nuevas.
  //
  // Regla de código: el ÚNICO consumidor legítimo de forSystem() es
  // NotificationsService (targeting de push y baja de tokens inválidos
  // tras procesar receipts). Es un contexto con privilegios de staff --
  // no usarlo como atajo para saltarse RLS en otro lado. El grep de CI
  // de Fase 8 que valida el uso exclusivo de forUser() tiene que cubrir
  // también forSystem()/forUserRaw().
  forSystem() {
    return this.withContext({ userId: 'system', role: Role.super_admin });
  }

  // Para SQL crudo (Fase 6: MetricsModule necesita GROUP BY/date_trunc
  // que Prisma no expresa con groupBy()). withContext() NO fija el
  // contexto RLS para $queryRaw/$executeRaw sueltos -- esos caen en la
  // rama `if (!model)` de arriba, que existe justamente para no romper
  // operaciones sin modelo, pero eso significa que un $queryRaw corrido
  // a través de forUser() se ejecuta SIN los GUC de sesión (devolvería
  // cero filas, o todas, según la política -- ver el gotcha documentado
  // en la bitácora de la Fase 5). Acá se abre la transacción a mano y se
  // fija el contexto ANTES de pasarle el cliente transaccional al
  // callback, así el raw query sí corre con RLS activo.
  async forUserRaw<T>(
    user: RequestUser,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true), set_config('app.role', ${user.role}, true), set_config('app.tenant_id', ${user.tenantId ?? ''}, true)`;
      return fn(tx);
    });
  }
}
