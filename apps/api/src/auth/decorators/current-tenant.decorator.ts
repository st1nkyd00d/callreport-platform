import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from '../../common/request-user';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user?.tenantId;
  },
);
