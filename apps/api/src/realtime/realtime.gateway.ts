import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Role } from '../../generated/prisma/enums';
import type { JwtPayload } from '../auth/jwt-payload';

// Fase 5 (plan.md): gateway de Socket.io para el dashboard del cliente en
// tiempo real. El room se deriva SIEMPRE del JWT verificado acá, nunca de
// lo que el cliente pida en el handshake -- mismo criterio de aislamiento
// que RLS aplica del lado de la base (ver call_reports_client_select).
// El CORS de este gateway se configura en RealtimeIoAdapter (main.ts, Fase
// 8 D2), no acá: las opciones de este decorador se evalúan al importar el
// archivo, antes de que ConfigModule cargue CORS_ORIGINS de .env.
@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`Conexión rechazada sin token (${client.id})`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      // Mismas reglas de room que RLS: client_user -> su tenant, staff ->
      // "staff" (ve todo), agent -> sin room (no hay evento dirigido a
      // agentes en esta fase).
      if (payload.role === Role.client_user && payload.tenantId) {
        await client.join(`tenant:${payload.tenantId}`);
      } else if (
        payload.role === Role.supervisor ||
        payload.role === Role.super_admin
      ) {
        await client.join('staff');
      }
    } catch {
      this.logger.warn(`Conexión rechazada con token inválido (${client.id})`);
      client.disconnect(true);
    }
  }

  emitReportCreated(
    report: { tenantId: string } & Record<string, unknown>,
  ): void {
    this.server
      .to([`tenant:${report.tenantId}`, 'staff'])
      .emit('report.created', report);
  }

  emitReportUpdated(
    report: { tenantId: string } & Record<string, unknown>,
  ): void {
    this.server
      .to([`tenant:${report.tenantId}`, 'staff'])
      .emit('report.updated', report);
  }

  // Fase 6: el badge de "Seguimientos" del dashboard del cliente se
  // actualiza en tiempo real cuando alguien (cliente o staff) resuelve un
  // seguimiento pendiente.
  emitFollowupResolved(
    report: { tenantId: string } & Record<string, unknown>,
  ): void {
    this.server
      .to([`tenant:${report.tenantId}`, 'staff'])
      .emit('followup.resolved', report);
  }
}
