import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

// Filtro global de excepciones (plan.md Fase 8, tarea 2). Respuestas
// consistentes en español con requestId/timestamp/path -- pero con una
// restricción crítica (Fase 7 D2 de plan-fase-7.md): ExportsController
// streamea el CSV con @Res() y para cuando falla a mitad de descarga ya
// mandó headers y medio archivo. Escribirle JSON encima produciría un CSV
// corrupto en vez de una descarga cortada, así que si los headers ya
// salieron, este filtro solo loguea y corta el socket.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      this.logger.error(
        'Excepción después de enviar headers -- se corta la conexión en vez de responder JSON encima',
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.destroy();
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[];
    let error: string;

    if (isHttpException) {
      const httpResponse = exception.getResponse();
      if (typeof httpResponse === 'string') {
        message = httpResponse;
        error = exception.name;
      } else {
        const responseObj = httpResponse as Record<string, unknown>;
        // El ValidationPipe global (Fase 2) devuelve `message` como array de
        // strings -- se preserva tal cual, ningún consumidor debe recibir un
        // formato distinto al que ya esperaban las suites e2e existentes.
        message =
          (responseObj.message as string | string[] | undefined) ??
          exception.message;
        error = (responseObj.error as string | undefined) ?? exception.name;
      }
    } else {
      message = 'Error interno del servidor';
      error = 'Internal Server Error';
      this.logger.error(
        exception instanceof Error ? exception.message : 'Error desconocido',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // pino-http (Fase 8, D6) le agrega `id` a la request antes de que
    // llegue acá -- randomUUID() es el fallback si por lo que sea ese
    // middleware todavía no corrió. El tipo de pino-http (ReqId) admite
    // `object`, pero nuestro propio genReqId (app.module.ts) siempre
    // devuelve string|number -- el chequeo de tipo evita el
    // "[object Object]" que tiraría un String(request.id) a ciegas.
    const requestId =
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : randomUUID();

    response.status(status).json({
      statusCode: status,
      message,
      error,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
