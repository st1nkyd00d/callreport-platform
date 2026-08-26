import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/request-user';
import { DEFAULT_DISPOSITIONS } from './default-dispositions';
import type { CreateCampaignDto } from './dto/create-campaign.dto';
import type { CreateDispositionDto } from './dto/create-disposition.dto';
import type { SetCampaignAgentsDto } from './dto/set-campaign-agents.dto';
import type { UpdateCampaignDto } from './dto/update-campaign.dto';
import type { UpdateDispositionDto } from './dto/update-disposition.dto';

function toCampaignView<
  T extends { agents: { userId: string }[]; dispositions: { id: string }[] },
>(campaign: T) {
  const { agents, dispositions, ...rest } = campaign;
  return {
    ...rest,
    agentIds: agents.map((a) => a.userId),
    dispositionsCount: dispositions.length,
  };
}

// agents solo cuenta las asignaciones activas (isActive: true) -- ver
// comentario en CampaignAgent (schema.prisma) sobre por qué desasignar es
// un UPDATE, no un DELETE.
const CAMPAIGN_INCLUDE = {
  agents: { where: { isActive: true }, select: { userId: true } },
  dispositions: { select: { id: true } },
} as const;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: RequestUser) {
    const rows = await this.prisma.forUser(user).campaign.findMany({
      include: CAMPAIGN_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(toCampaignView);
  }

  async findOne(user: RequestUser, id: string) {
    const row = await this.prisma.forUser(user).campaign.findUnique({
      where: { id },
      include: CAMPAIGN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Campaña no encontrada');
    return toCampaignView(row);
  }

  async create(user: RequestUser, dto: CreateCampaignDto) {
    const db = this.prisma.forUser(user);
    const tenant = await db.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new BadRequestException('La empresa indicada no existe');

    // Sin compensación si el createMany de abajo falla: app_user nunca
    // tiene GRANT DELETE (ver prisma/init/01-roles.sql), así que no hay
    // forma de "deshacer" el create de la campaña -- y con el tenant ya
    // validado arriba, el único motivo de falla realista es una caída de
    // conexión, que un delete tampoco podría manejar de forma confiable.
    const campaign = await db.campaign.create({
      data: { name: dto.name, tenantId: dto.tenantId },
    });

    await db.disposition.createMany({
      data: DEFAULT_DISPOSITIONS.map((d, i) => ({
        campaignId: campaign.id,
        label: d.label,
        code: d.code,
        sortOrder: i,
        requiresFollowup: d.requiresFollowup,
        requiresDetail: d.requiresDetail,
        requiresSchedule: d.requiresSchedule,
        color: d.color,
        icon: d.icon,
      })),
    });

    return this.findOne(user, campaign.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateCampaignDto) {
    await this.findOne(user, id);
    await this.prisma
      .forUser(user)
      .campaign.update({ where: { id }, data: dto });
    return this.findOne(user, id);
  }

  // Reemplaza el set de agentes asignados sin ningún DELETE: reactiva
  // (upsert) los que entran, desactiva (updateMany) los que ya no están.
  async setAgents(
    user: RequestUser,
    campaignId: string,
    dto: SetCampaignAgentsDto,
  ) {
    await this.findOne(user, campaignId);
    const db = this.prisma.forUser(user);

    for (const userId of dto.agentIds) {
      await db.campaignAgent.upsert({
        where: { campaignId_userId: { campaignId, userId } },
        create: { campaignId, userId },
        update: { isActive: true },
      });
    }
    await db.campaignAgent.updateMany({
      where: {
        campaignId,
        userId: { notIn: dto.agentIds.length > 0 ? dto.agentIds : [''] },
      },
      data: { isActive: false },
    });

    return this.findOne(user, campaignId);
  }

  async listDispositions(user: RequestUser, campaignId: string) {
    await this.findOne(user, campaignId);
    return this.prisma.forUser(user).disposition.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // Fase 4: campañas asignadas al agente autenticado -- RLS
  // (campaigns_agent_select) ya limita el resultado a las campañas
  // activas donde campaign_agents.is_active es true, así que acá solo
  // se ordena/formatea. A diferencia de findAll() (admin), no incluye
  // agentIds ni dispositionsCount: exponer la lista de compañeros
  // asignados a la misma campaña no le sirve al agente y no es su
  // información.
  findAllForAgent(user: RequestUser) {
    return this.prisma.forUser(user).campaign.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, tenant: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // Fase 4: tipificaciones activas de una campaña, para el agente
  // (formulario de reporte) y el cliente (Fase 5). Sin @Roles en el
  // controller -- RLS ya resuelve qué campañas puede ver cada rol; un
  // findUnique() que no matchea ninguna política devuelve null, igual
  // que para un id inexistente.
  async listActiveDispositions(user: RequestUser, campaignId: string) {
    const db = this.prisma.forUser(user);
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    return db.disposition.findMany({
      where: { campaignId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createDisposition(
    user: RequestUser,
    campaignId: string,
    dto: CreateDispositionDto,
  ) {
    await this.findOne(user, campaignId);
    const db = this.prisma.forUser(user);
    const last = await db.disposition.findFirst({
      where: { campaignId },
      orderBy: { sortOrder: 'desc' },
    });
    return db.disposition.create({
      data: {
        campaignId,
        label: dto.label,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        requiresFollowup: dto.requiresFollowup ?? false,
        requiresDetail: dto.requiresDetail ?? false,
        requiresSchedule: dto.requiresSchedule ?? false,
      },
    });
  }

  // Sin endpoint de borrado a propósito (plan.md: "no borrar si tienen
  // reportes asociados", y app_user tampoco tiene GRANT DELETE de todas
  // formas) -- "eliminar" una tipificación es PATCH { isActive: false }.
  async updateDisposition(
    user: RequestUser,
    campaignId: string,
    dispositionId: string,
    dto: UpdateDispositionDto,
  ) {
    await this.findDispositionOrThrow(user, campaignId, dispositionId);
    return this.prisma.forUser(user).disposition.update({
      where: { id: dispositionId },
      data: dto,
    });
  }

  private async findDispositionOrThrow(
    user: RequestUser,
    campaignId: string,
    dispositionId: string,
  ) {
    const disposition = await this.prisma.forUser(user).disposition.findFirst({
      where: { id: dispositionId, campaignId },
    });
    if (!disposition) throw new NotFoundException('Tipificación no encontrada');
    return disposition;
  }
}
