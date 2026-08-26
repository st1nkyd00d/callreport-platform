import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'auditEntity';

// Marca un handler mutante (POST/PATCH/PUT/DELETE) para que AuditInterceptor
// escriba una fila en audit_logs tras la respuesta exitosa. El nombre debe
// coincidir con el entityType que se quiere ver en el registro de auditoría
// (p.ej. 'Tenant', 'Campaign', 'Disposition') — no tiene que ser el nombre
// exacto del modelo Prisma.
export const AuditEntity = (entityType: string) =>
  SetMetadata(AUDIT_ENTITY_KEY, entityType);
