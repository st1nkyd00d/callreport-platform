import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestWithUser } from '../../common/request-user';

// Global (registrado vía APP_GUARD en AuthModule), corre después de
// JwtAuthGuard. Sin @Roles(...) en la ruta, no restringe nada -- el
// guard de autenticación ya exigió un JWT válido.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return !!user && required.includes(user.role);
  }
}
