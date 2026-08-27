import { BadRequestException } from '@nestjs/common';

export interface ExportFilters {
  from?: Date;
  to?: Date;
  campaignId?: string;
  dispositionIds?: string[];
  tenantId?: string;
}

// Mismo parseo a mano que reports.controller.ts (sin DTO de clase -- el
// ValidationPipe global con forbidNonWhitelisted rompería un ?tenantId=
// forzado, y ese es justo el caso que el criterio de aislamiento necesita
// que devuelva 200, no 400).
function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} no es una fecha válida`);
  }
  return d;
}

function parseIdList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

export interface ExportFiltersQuery {
  from?: string;
  to?: string;
  campaignId?: string;
  dispositionId?: string;
  tenantId?: string;
}

// plan-fase-7.md D7: tenantId es un filtro opcional que solo tiene efecto
// para staff. RLS ya impide que un client_user vea filas de otro tenant,
// así que agregar ese filtro para un rol no-staff no podría revelar nada
// -- pero SÍ cambiaría el resultado (una intersección vacía entre "mis
// propias filas" y "las de un tenant ajeno"), rompiendo el criterio de
// aceptación "?tenantId= forzado -> el archivo no cambia". Por eso se
// ignora explícitamente en vez de dejar que RLS lo neutralice solo.
export function parseExportFilters(
  query: ExportFiltersQuery,
  isStaff: boolean,
): ExportFilters {
  return {
    from: parseDate(query.from, 'from'),
    to: parseDate(query.to, 'to'),
    campaignId: query.campaignId,
    dispositionIds: parseIdList(query.dispositionId),
    tenantId: isStaff ? query.tenantId : undefined,
  };
}
