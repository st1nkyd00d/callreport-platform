import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Expo as ExpoType,
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
} from 'expo-server-sdk';
import { isExpoPushToken } from './push-token-format';

// Wrapper delgado sobre expo-server-sdk (plan.md Fase 6, tarea 1: "envío
// con expo-server-sdk en lotes; procesar receipts"). No sabe nada de
// Prisma/tenants/usuarios -- esa parte vive en NotificationsService, que
// es quien decide A QUIÉN y CON QUÉ TEXTO. Separado así porque es lo que
// el test e2e sustituye por un doble para capturar mensajes sin llamar a
// la API real de Expo.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private expoInstance: ExpoType | null = null;
  private readonly accessToken?: string;
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    // PUSH_ENABLED=false (apps/api/.env) apaga el envío real sin tocar
    // código -- útil en desarrollo/tests para no gastar la cuota de Expo.
    this.enabled = config.get<string>('PUSH_ENABLED') !== 'false';
    this.accessToken = config.get<string>('EXPO_ACCESS_TOKEN') || undefined;
  }

  // expo-server-sdk (7.x) es ESM puro -- se carga con import() dinámico y
  // perezoso, nunca con un `import` estático de nivel de módulo (eso
  // rompería la carga de NotificationsModule bajo Jest en este entorno,
  // ver push-token-format.ts para el detalle). Mismo patrón que ya usa el
  // motor WASM de Prisma en este proyecto.
  private async getExpo(): Promise<ExpoType> {
    if (!this.expoInstance) {
      const { Expo } = await import('expo-server-sdk');
      this.expoInstance = new Expo(
        this.accessToken ? { accessToken: this.accessToken } : undefined,
      );
    }
    return this.expoInstance;
  }

  isValidToken(token: string): boolean {
    return isExpoPushToken(token);
  }

  // Devuelve los tickets en el mismo orden que `messages` (expo-server-sdk
  // preserva el orden dentro de cada chunk) -- NotificationsService
  // necesita ese alineamiento 1:1 para saber a qué push_token corresponde
  // cada ticket.
  async sendAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (!this.enabled || messages.length === 0) return [];
    const expo = await this.getExpo();
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      try {
        tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
      } catch (err) {
        // Un chunk entero puede fallar (Expo caído, etc.) -- se rellena con
        // tickets de error para no desalinear tickets[] contra messages[].
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error enviando chunk de push: ${message}`);
        tickets.push(
          ...chunk.map(() => ({ status: 'error' as const, message })),
        );
      }
    }
    return tickets;
  }

  async getReceiptsAsync(
    receiptIds: string[],
  ): Promise<Record<string, ExpoPushReceipt>> {
    if (receiptIds.length === 0) return {};
    const expo = await this.getExpo();
    const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    const receipts: Record<string, ExpoPushReceipt> = {};
    for (const chunk of chunks) {
      try {
        Object.assign(
          receipts,
          await expo.getPushNotificationReceiptsAsync(chunk),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error consultando receipts de push: ${message}`);
      }
    }
    return receipts;
  }
}
