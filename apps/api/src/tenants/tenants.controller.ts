import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

// Fase 3 (plan.md): creación de tenants solo super_admin; lectura/edición
// también para supervisor (@Roles de método pisa al de clase, ver
// RolesGuard.getAllAndOverride).
@Controller('admin/tenants')
@Roles(Role.super_admin, Role.supervisor)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.tenantsService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tenantsService.findOne(user, id);
  }

  @Roles(Role.super_admin)
  @AuditEntity('Tenant')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(user, dto);
  }

  @AuditEntity('Tenant')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(user, id, dto);
  }
}
