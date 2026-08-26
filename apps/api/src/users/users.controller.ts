import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const VALID_ROLES = Object.values(Role) as string[];

// Fase 3 (plan.md): alta y borrado de usuarios solo super_admin; el resto
// (listar, editar estado, resetear contraseña) también para supervisor.
@Controller('admin/users')
@Roles(Role.super_admin, Role.supervisor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query('role') role?: string) {
    const filter = role && VALID_ROLES.includes(role) ? (role as Role) : undefined;
    return this.usersService.findAll(user, filter);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.usersService.findOne(user, id);
  }

  @Roles(Role.super_admin)
  @AuditEntity('User')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @AuditEntity('User')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @AuditEntity('User')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(user, id, dto);
  }
}
