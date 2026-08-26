import { Controller, Get } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../auth/decorators/roles.decorator';

// Placeholder de la Fase 2 (plan.md): existe para probar que RolesGuard
// devuelve 403 a roles no-staff en rutas /admin/*. El CRUD real de
// administración (tenants/usuarios/campañas) llega en la Fase 3 bajo
// este mismo prefijo.
@Controller('admin')
@Roles(Role.super_admin, Role.supervisor)
export class AdminController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}
