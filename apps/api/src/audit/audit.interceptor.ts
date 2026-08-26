import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';
import { AUDIT_ACTION_KEY, AUDIT_ENTITY_KEY } from './audit-entity.decorator';

interface RequestWithUser extends Request {
  user?: RequestUser;
}

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'create',
  DELETE: 'delete',
};

// Interceptor global (APP_GUARD ya corrió antes que esto, req.user está
// seteado). Escribe en audit_logs DESPUÉS de que el handler resolvió con
// éxito pero ANTES de que la respuesta salga al cliente (concatMap espera
// la promesa, a diferencia de tap) -- los tests e2e leen audit_logs justo
// después de recibir el 200/201 y no pueden quedar en una carrera con un
// insert todavía en vuelo.
//
// Diff superficial a propósito (antes: undefined, after: valor del body):
// mismo criterio que ya usa el reducer mock de admin-web
// (AppStore.tsx#audit()) -- no hace falta un diff profundo para el
// criterio de aceptación de Fase 3 ("aparece en audit_logs con usuario,
// diff e IP").
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entityType = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ENTITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!entityType) return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const actionOverride = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const action = actionOverride ?? ACTION_BY_METHOD[request.method] ?? 'update';

    return next.handle().pipe(
      concatMap(async (response: unknown) => {
        await this.write(request, entityType, action, response);
        return response;
      }),
    );
  }

  private async write(
    request: RequestWithUser,
    entityType: string,
    action: string,
    response: unknown,
  ): Promise<void> {
    const user = request.user;
    if (!user) return;

    const params = request.params ?? {};
    const paramValues = Object.values(params);
    const lastParam = paramValues[paramValues.length - 1];
    const entityId =
      (response as { id?: string } | undefined)?.id ??
      (Array.isArray(lastParam) ? lastParam[0] : lastParam) ??
      'unknown';

    const body = (request.body ?? {}) as Record<string, unknown>;
    const diff: Prisma.InputJsonValue | undefined =
      Object.keys(body).length > 0
        ? Object.entries(body).map(([field, after]) => ({
            field,
            before: null,
            after: after as Prisma.InputJsonValue,
          }))
        : undefined;

    const forwardedFor = request.headers['x-forwarded-for'];
    const ipAddress =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
        ?.split(',')[0]
        ?.trim() ??
      request.socket?.remoteAddress ??
      undefined;

    await this.prisma.forUser(user).auditLog.create({
      data: {
        userId: user.id,
        action,
        entityType,
        entityId,
        diff,
        ipAddress,
      },
    });
  }
}
