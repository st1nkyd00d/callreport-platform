import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

// Fase 8 (D2): el CORS del gateway pasa de vivir en el decorador
// `@WebSocketGateway({ cors: ... })` -- evaluado al IMPORTAR el archivo,
// antes de que ConfigModule cargue .env -- a este adapter, instanciado en
// main.ts cuando ConfigService ya tiene el valor real de CORS_ORIGINS.
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
    });
  }
}
