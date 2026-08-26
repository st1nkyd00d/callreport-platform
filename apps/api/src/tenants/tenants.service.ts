import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/request-user';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: RequestUser) {
    return this.prisma.forUser(user).tenant.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: RequestUser, id: string) {
    const tenant = await this.prisma.forUser(user).tenant.findUnique({
      where: { id },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    return tenant;
  }

  create(user: RequestUser, dto: CreateTenantDto) {
    return this.prisma.forUser(user).tenant.create({
      data: {
        name: dto.name,
        editWindowMinutes: dto.editWindowMinutes,
      },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateTenantDto) {
    await this.findOne(user, id);
    return this.prisma.forUser(user).tenant.update({
      where: { id },
      data: dto,
    });
  }
}
