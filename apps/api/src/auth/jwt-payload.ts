import { Role } from '../../generated/prisma/enums';

// Payload del access token (plan.md Fase 2, tarea 1): sub = user_id,
// tenantId solo presente para client_user (resuelto desde
// tenant_memberships al hacer login/refresh), ausente para staff.
export interface JwtPayload {
  sub: string;
  role: Role;
  tenantId?: string;
}
