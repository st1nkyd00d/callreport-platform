import { Body, Controller, Delete, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { PushTokensService } from './push-tokens.service';

// Sin @Roles: cualquier usuario autenticado (agente, cliente, staff)
// puede registrar el token de su propio dispositivo.
@Controller('push')
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  @Post('register')
  register(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushTokens.register(user, dto);
  }

  @Delete('register')
  unregister(
    @CurrentUser() user: RequestUser,
    @Body() dto: UnregisterPushTokenDto,
  ) {
    return this.pushTokens.unregister(user, dto.token);
  }
}
