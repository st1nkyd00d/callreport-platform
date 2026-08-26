import { Role } from '../../generated/prisma/enums';

// Forma del usuario autenticado que viaja en el JWT y en req.user (ver
// AuthModule). tenantId solo existe para client_user (desde
// tenant_memberships al emitir el token); el resto del staff no tiene
// tenant propio -- PrismaService.forUser() lo traduce a NULL para RLS.
export interface RequestUser {
  id: string;
  role: Role;
  tenantId?: string;
}

// Forma mínima de Request que necesitan los guards/decoradores de auth --
// evita depender del tipo Request de express solo para tipar req.user.
export interface RequestWithUser {
  user?: RequestUser;
}
