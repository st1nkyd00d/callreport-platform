import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '../../generated/prisma/enums';
import { PushService } from './push.service';
import type { ExpoPushTicket } from 'expo-server-sdk';

// Forma mínima del reporte que necesita el targeting de push -- no importa
// el tipo completo de ReportsService a propósito (evitaría un ciclo entre
// ReportsModule y NotificationsModule; ReportsModule es quien importa a
// este, no al revés).
export interface ReportForNotification {
  id: string;
  tenantId: string;
  contactName: string;
  campaign: { name: string };
  disposition: { label: string; requiresFollowup: boolean };
}

// Expo recomienda consultar los receipts un rato después del envío (no
// están disponibles al instante). Sin tabla ni cron dedicados a esta
// escala (D6, plan-fase-6.md): se guarda el mapeo receiptId -> pushTokenId
// en memoria y se programa un timer; si el proceso reinicia antes de que
// dispare, ese chequeo puntual se pierde -- un token realmente inválido
// vuelve a fallar en el siguiente envío y se da de baja ahí.
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // plan.md Fase 6: "Al crear reporte: push a los client_users del tenant
  // («Nuevo reporte de llamada — {campaña}»). Si la disposition tiene
  // requires_followup: push adicional a supervisores." Vía forSystem()
  // (ver prisma.service.ts): bajo forUser(agente) que crea el reporte,
  // tenant_memberships y los push_tokens de otros usuarios devuelven cero
  // filas -- el agente no tiene ninguna política RLS sobre esas tablas.
  async notifyReportCreated(report: ReportForNotification): Promise<void> {
    const db = this.prisma.forSystem();

    const clientMemberships = await db.tenantMembership.findMany({
      where: { tenantId: report.tenantId, user: { status: UserStatus.active } },
      select: { userId: true },
    });
    const clientUserIds = new Set(clientMemberships.map((m) => m.userId));

    const recipientIds = [...clientUserIds];
    if (report.disposition.requiresFollowup) {
      const supervisors = await db.user.findMany({
        where: { role: Role.supervisor, status: UserStatus.active },
        select: { id: true },
      });
      recipientIds.push(...supervisors.map((s) => s.id));
    }
    if (recipientIds.length === 0) return;

    const tokens = await db.pushToken.findMany({
      where: { userId: { in: recipientIds }, revokedAt: null },
    });
    if (tokens.length === 0) return;

    const messages = tokens.map((t) => {
      const forClient = clientUserIds.has(t.userId);
      return {
        to: t.token,
        sound: 'default' as const,
        title: forClient ? 'Nuevo reporte de llamada' : 'Seguimiento pendiente',
        body: forClient
          ? `${report.campaign.name} — ${report.contactName}`
          : `${report.campaign.name} — ${report.contactName} requiere seguimiento`,
        data: {
          type: 'report.created',
          reportId: report.id,
          tenantId: report.tenantId,
        },
      };
    });

    const tickets = await this.push.sendAsync(messages);
    await this.handleTickets(tokens, tickets);
  }

  private async handleTickets(
    tokens: { id: string }[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const receiptIdToTokenId = new Map<string, string>();
    const toRevoke: string[] = [];

    tickets.forEach((ticket, i) => {
      const tokenRow = tokens[i];
      if (!tokenRow) return;
      if (ticket.status === 'ok') {
        receiptIdToTokenId.set(ticket.id, tokenRow.id);
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        // Expo a veces ya devuelve el error en el TICKET, no hace falta
        // esperar el receipt para dar de baja este caso.
        toRevoke.push(tokenRow.id);
      } else {
        this.logger.warn(`Ticket de push con error: ${ticket.message}`);
      }
    });

    if (toRevoke.length > 0) await this.revokeTokens(toRevoke);
    if (receiptIdToTokenId.size > 0) this.scheduleReceiptCheck(receiptIdToTokenId);
  }

  private scheduleReceiptCheck(receiptIdToTokenId: Map<string, string>): void {
    const timer = setTimeout(() => {
      void this.checkReceipts(receiptIdToTokenId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error chequeando receipts programados: ${message}`);
      });
    }, RECEIPT_CHECK_DELAY_MS);
    // No debe mantener vivo el proceso solo por este timer pendiente.
    timer.unref?.();
  }

  // Público: lo invoca el timer de arriba en producción y el test e2e
  // directo (sin esperar 15 minutos reales).
  async checkReceipts(receiptIdToTokenId: Map<string, string>): Promise<void> {
    const receipts = await this.push.getReceiptsAsync([...receiptIdToTokenId.keys()]);
    const toRevoke: string[] = [];
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        const tokenId = receiptIdToTokenId.get(receiptId);
        if (tokenId) toRevoke.push(tokenId);
      }
    }
    if (toRevoke.length > 0) await this.revokeTokens(toRevoke);
  }

  private async revokeTokens(tokenIds: string[]): Promise<void> {
    await this.prisma.forSystem().pushToken.updateMany({
      where: { id: { in: tokenIds } },
      data: { revokedAt: new Date() },
    });
  }
}
