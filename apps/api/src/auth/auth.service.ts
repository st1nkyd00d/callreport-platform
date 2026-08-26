import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { JwtPayload } from './jwt-payload';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

// Login/refresh corren ANTES de que exista un usuario autenticado, así
// que este servicio es la única excepción documentada a la regla
// "los servicios de negocio solo acceden a la DB vía forUser()"
// (ver PrismaService): usa el cliente base directamente contra tablas
// sin RLS (users, tenant_memberships, refresh_tokens).
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tenantId = await this.resolveTenantId(user.id, user.role);
    const tokens = await this.issueTokens(user.id, user.role, tenantId);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
      },
    };
  }

  async refresh(dto: RefreshDto) {
    const [tokenId, secret] = (dto.refreshToken ?? '').split('.');
    if (!tokenId || !secret) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });
    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (stored.revokedAt) {
      // Un token ya rotado que vuelve a usarse es la señal clásica de
      // robo (alguien más lo usó primero, o un cliente perdió la
      // rotación y reintenta el viejo) -- se revoca toda la familia del
      // usuario en vez de solo rechazar este intento.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const secretOk = await argon2.verify(stored.tokenHash, secret);
    if (!secretOk) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Usuario inválido');
    }

    const tenantId = await this.resolveTenantId(user.id, user.role);
    const { tokens, refreshTokenId } = await this.issueTokensWithId(
      user.id,
      user.role,
      tenantId,
    );
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: refreshTokenId },
    });
    return tokens;
  }

  async logout(dto: RefreshDto) {
    const [tokenId] = (dto.refreshToken ?? '').split('.');
    if (!tokenId) return;
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async resolveTenantId(
    userId: string,
    role: Role,
  ): Promise<string | undefined> {
    if (role !== Role.client_user) return undefined;
    // tenant_memberships tiene FORCE ROW LEVEL SECURITY -- hay que pasar
    // por forUser() aun sin tenant_id todavía conocido (es lo que se
    // busca). La política tenant_memberships_self_select (migración
    // tenant_membership_self_select) permite este auto-lookup por
    // user_id sin necesitar tenant_id de antemano.
    const db = this.prisma.forUser({ id: userId, role });
    const membership = await db.tenantMembership.findFirst({
      where: { userId },
    });
    return membership?.tenantId;
  }

  private async issueTokens(
    userId: string,
    role: Role,
    tenantId: string | undefined,
  ): Promise<IssuedTokens> {
    return (await this.issueTokensWithId(userId, role, tenantId)).tokens;
  }

  private async issueTokensWithId(
    userId: string,
    role: Role,
    tenantId: string | undefined,
  ): Promise<{ tokens: IssuedTokens; refreshTokenId: string }> {
    const payload: JwtPayload = { sub: userId, role, tenantId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    // Refresh token opaco "selector.validador": el selector (id de la
    // fila) permite buscarlo en O(1) sin comparar contra todos los
    // hashes; el validador se guarda hasheado (argon2, con salt
    // aleatorio, no reproducible) y se verifica con argon2.verify, igual
    // que una contraseña.
    const secret = randomBytes(32).toString('base64url');
    const tokenHash = await argon2.hash(secret);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const created = await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return {
      tokens: { accessToken, refreshToken: `${created.id}.${secret}` },
      refreshTokenId: created.id,
    };
  }
}
