import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/request-user';
import type { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  // forSystem(), no forUser(): el mismo dispositivo (mismo token Expo)
  // puede reaparecer bajo OTRO usuario tras un logout/login (ver
  // auth-context.tsx: logout() da de baja el token antes de cerrar sesión,
  // pero un reinstall o un token todavía no dado de baja puede repetirse).
  // Bajo forUser(), la política push_tokens_self_all esconde la fila
  // existente de otro dueño (RLS) y el upsert intentaría un INSERT que
  // chocaría contra el @unique(token). Conocer el valor del token --
  // generado por el propio dispositivo/Expo, no adivinable -- es la señal
  // de "soy el dueño actual de este dispositivo" (D1, plan-fase-6.md).
  register(user: RequestUser, dto: RegisterPushTokenDto) {
    return this.prisma.forSystem().pushToken.upsert({
      where: { token: dto.token },
      create: { userId: user.id, token: dto.token, platform: dto.platform },
      update: {
        userId: user.id,
        platform: dto.platform,
        revokedAt: null,
        lastUsedAt: new Date(),
      },
    });
  }

  // forUser(): push_tokens_self_all ya limita esto a las filas propias --
  // si el token no es del usuario autenticado, la RLS lo deja en 0 filas
  // afectadas en vez de dar de baja el token de otro.
  async unregister(user: RequestUser, token: string): Promise<{ ok: true }> {
    await this.prisma.forUser(user).pushToken.updateMany({
      where: { token, userId: user.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
