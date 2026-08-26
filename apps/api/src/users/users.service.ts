import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  createdAt: true,
  tenantMemberships: { select: { tenantId: true } },
} as const;

function toSafeUser<
  T extends { tenantMemberships: { tenantId: string }[] },
>(user: T) {
  const { tenantMemberships, ...rest } = user;
  return { ...rest, tenantId: tenantMemberships[0]?.tenantId };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: RequestUser, role?: Role) {
    const rows = await this.prisma.forUser(user).user.findMany({
      where: role ? { role } : undefined,
      select: SAFE_SELECT,
      orderBy: { fullName: 'asc' },
    });
    return rows.map(toSafeUser);
  }

  async findOne(user: RequestUser, id: string) {
    const row = await this.prisma.forUser(user).user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return toSafeUser(row);
  }

  async create(user: RequestUser, dto: CreateUserDto) {
    const db = this.prisma.forUser(user);

    // Se valida el tenant ANTES de crear el user: app_user nunca tiene
    // GRANT DELETE (ver prisma/init/01-roles.sql), así que no hay forma de
    // revertir el create de abajo si el tenantId fuera inválido -- mejor
    // que ese create ni siquiera pueda fallar por eso.
    if (dto.role === Role.client_user) {
      const tenant = await db.tenant.findUnique({ where: { id: dto.tenantId } });
      if (!tenant) throw new BadRequestException('La empresa indicada no existe');
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await db.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash,
      },
      select: SAFE_SELECT,
    });

    if (dto.role === Role.client_user) {
      await db.tenantMembership.create({
        data: { userId: created.id, tenantId: dto.tenantId! },
      });
    }

    return toSafeUser({ ...created, tenantMemberships: dto.tenantId ? [{ tenantId: dto.tenantId }] : [] });
  }

  async update(user: RequestUser, id: string, dto: UpdateUserDto) {
    await this.findOne(user, id);
    const updated = await this.prisma.forUser(user).user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
    return toSafeUser(updated);
  }

  async resetPassword(user: RequestUser, id: string, dto: ResetPasswordDto) {
    await this.findOne(user, id);
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.forUser(user).user.update({
      where: { id },
      data: { passwordHash },
    });
    return { ok: true };
  }
}
