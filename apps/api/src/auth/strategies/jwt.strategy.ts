import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RequestUser } from '../../common/request-user';
import type { JwtPayload } from '../jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET no está configurado (ver apps/api/.env.example)',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // Passport llama esto tras verificar firma+expiración; lo que devuelve
  // queda en req.user (leído por @CurrentUser()/@CurrentTenant() y por
  // RolesGuard). Un payload sin `sub` no debería pasar nunca la firma,
  // pero se valida explícito para no propagar un req.user roto.
  validate(payload: JwtPayload): RequestUser {
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Token inválido');
    }
    return { id: payload.sub, role: payload.role, tenantId: payload.tenantId };
  }
}
