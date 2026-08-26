import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser, RequestWithUser } from '../../common/request-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user!;
  },
);
