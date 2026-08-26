import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TenantStatus, UserStatus } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';

export interface MetricsRange {
  from: Date;
  to: Date;
  tz: string;
}

// plan.md Fase 6: "agregados con SQL crudo (GROUP BY + date_trunc) -- el
// volumen esperado (<20 agentes) no justifica tablas de resumen". Todo vía
// forUserRaw() (gotcha documentado en la bitácora de Fase 5: forUser() NO
// fija el contexto RLS para $queryRaw suelto, ver prisma.service.ts).
// @Roles(supervisor, super_admin) en el controller ya garantiza que quien
// llama tiene la política call_reports_staff_all (FOR ALL, sin filtro de
// tenant) -- por eso estas queries pueden agregar entre tenants sin
// filtrar tenant_id a mano.
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async agents(user: RequestUser, range: MetricsRange) {
    return this.prisma.forUserRaw(user, async (tx) => {
      const { from, to } = range;

      const agents = await tx.user.findMany({
        where: { role: Role.agent, status: UserStatus.active },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      if (agents.length === 0) return [];

      const [countRows, hoursRows] = await Promise.all([
        tx.$queryRaw<
          {
            agentId: string;
            dispositionId: string;
            label: string;
            code: string | null;
            color: string | null;
            requiresFollowup: boolean;
            count: bigint;
          }[]
        >`
          SELECT cr.agent_id AS "agentId", cr.disposition_id AS "dispositionId",
                 d.label, d.code, d.color, d.requires_followup AS "requiresFollowup",
                 COUNT(*)::bigint AS count
          FROM call_reports cr
          JOIN dispositions d ON d.id = cr.disposition_id
          WHERE cr.created_at >= ${from} AND cr.created_at < ${to}
          GROUP BY cr.agent_id, cr.disposition_id, d.label, d.code, d.color, d.requires_followup
        `,
        // Horas activas recortadas al rango [from, to): un turno que
        // arrancó antes o sigue abierto (ended_at NULL -> now()) solo
        // aporta la porción de tiempo que realmente cae dentro del rango.
        tx.$queryRaw<{ userId: string; hours: number | null }[]>`
          SELECT s.user_id AS "userId",
                 SUM(GREATEST(0, EXTRACT(EPOCH FROM (
                   LEAST(COALESCE(s.ended_at, now()), ${to}) - GREATEST(s.started_at, ${from})
                 )))) / 3600.0 AS hours
          FROM shifts s
          WHERE s.started_at < ${to} AND COALESCE(s.ended_at, now()) > ${from}
          GROUP BY s.user_id
        `,
      ]);

      const hoursByAgent = new Map(hoursRows.map((r) => [r.userId, Number(r.hours ?? 0)]));
      const dispositionsByAgent = new Map<
        string,
        {
          dispositionId: string;
          label: string;
          code: string | null;
          color: string | null;
          requiresFollowup: boolean;
          count: number;
        }[]
      >();
      const totalByAgent = new Map<string, number>();
      for (const row of countRows) {
        const count = Number(row.count);
        totalByAgent.set(row.agentId, (totalByAgent.get(row.agentId) ?? 0) + count);
        const list = dispositionsByAgent.get(row.agentId) ?? [];
        list.push({
          dispositionId: row.dispositionId,
          label: row.label,
          code: row.code,
          color: row.color,
          requiresFollowup: row.requiresFollowup,
          count,
        });
        dispositionsByAgent.set(row.agentId, list);
      }

      return agents.map((agent) => {
        const total = totalByAgent.get(agent.id) ?? 0;
        const activeHours = hoursByAgent.get(agent.id) ?? 0;
        return {
          agentId: agent.id,
          fullName: agent.fullName,
          total,
          activeHours: Number(activeHours.toFixed(2)),
          perActiveHour: activeHours > 0 ? Number((total / activeHours).toFixed(2)) : 0,
          byDisposition: dispositionsByAgent.get(agent.id) ?? [],
        };
      });
    });
  }

  async overview(user: RequestUser, range: MetricsRange) {
    return this.prisma.forUserRaw(user, async (tx) => {
      const { from, to, tz } = range;

      const [byDayRows, byTenantRows, byCampaignRows, activeTenants, pendingFollowups, agentsOnShift] =
        await Promise.all([
          tx.$queryRaw<{ day: string; count: bigint }[]>`
            SELECT to_char(date_trunc('day', created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
                   COUNT(*)::bigint AS count
            FROM call_reports
            WHERE created_at >= ${from} AND created_at < ${to}
            GROUP BY 1
            ORDER BY 1
          `,
          tx.$queryRaw<{ tenantId: string; name: string; count: bigint }[]>`
            SELECT cr.tenant_id AS "tenantId", t.name, COUNT(*)::bigint AS count
            FROM call_reports cr
            JOIN tenants t ON t.id = cr.tenant_id
            WHERE cr.created_at >= ${from} AND cr.created_at < ${to}
            GROUP BY cr.tenant_id, t.name
            ORDER BY count DESC
          `,
          tx.$queryRaw<{ campaignId: string; name: string; count: bigint }[]>`
            SELECT cr.campaign_id AS "campaignId", c.name, COUNT(*)::bigint AS count
            FROM call_reports cr
            JOIN campaigns c ON c.id = cr.campaign_id
            WHERE cr.created_at >= ${from} AND cr.created_at < ${to}
            GROUP BY cr.campaign_id, c.name
            ORDER BY count DESC
          `,
          tx.tenant.count({ where: { status: TenantStatus.active } }),
          tx.callReport.count({
            where: { disposition: { requiresFollowup: true }, followupResolvedAt: null },
          }),
          tx.shift.count({ where: { endedAt: null } }),
        ]);

      const byDay = byDayRows.map((r) => ({ date: r.day, count: Number(r.count) }));
      const totalReports = byDay.reduce((sum, d) => sum + d.count, 0);

      return {
        totalReports,
        activeTenants,
        pendingFollowups,
        agentsOnShift,
        byDay,
        byTenant: byTenantRows.map((r) => ({
          tenantId: r.tenantId,
          name: r.name,
          count: Number(r.count),
        })),
        byCampaign: byCampaignRows.map((r) => ({
          campaignId: r.campaignId,
          name: r.name,
          count: Number(r.count),
        })),
      };
    });
  }
}
