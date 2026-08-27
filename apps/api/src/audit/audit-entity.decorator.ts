import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'auditEntity';
export const AUDIT_ACTION_KEY = 'auditAction';

// Marca un handler mutante (POST/PATCH/PUT/DELETE) para que AuditInterceptor
// escriba una fila en audit_logs tras la respuesta exitosa. El nombre debe
// coincidir con el entityType que se quiere ver en el registro de auditoría
// (p.ej. 'Tenant', 'Campaign', 'Disposition') — no tiene que ser el nombre
// exacto del modelo Prisma.
export const AuditEntity = (entityType: string) =>
  SetMetadata(AUDIT_ENTITY_KEY, entityType);

// Override explícito de la acción registrada (por defecto AuditInterceptor
// la deriva del método HTTP: POST->create, DELETE->delete, el resto->update).
// Fase 6: POST /followups/:id/resolve es un POST pero la acción real no es
// "create" -- sin esto quedaría mal etiquetada en audit_logs.
export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);
