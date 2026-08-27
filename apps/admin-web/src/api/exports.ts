import { ApiError } from './client';
import { useAdminAuth } from './auth-context';

// Fase 7 (plan.md): descarga CSV/PDF -- mismos filtros que el dashboard/
// visor de auditoría. authFetch ya manda Authorization: Bearer y
// reintenta una vez en 401 (D6, plan-fase-7.md: nunca un ?token= en la
// query -- terminaría en logs de acceso e historial del navegador).
export type ExportFormat = 'csv' | 'pdf';

export interface ExportFilters {
  from?: string;
  to?: string;
  campaignId?: string;
  dispositionIds?: string[];
  // Solo tiene efecto para super_admin/supervisor (D7): "una empresa" del
  // export global. Se omite para el export normal desde ClientesPage.
  tenantId?: string;
}

function buildExportUrl(format: ExportFormat, filters: ExportFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.campaignId) params.set('campaignId', filters.campaignId);
  if (filters.dispositionIds?.length) {
    params.set('dispositionId', filters.dispositionIds.join(','));
  }
  if (filters.tenantId) params.set('tenantId', filters.tenantId);
  const qs = params.toString();
  return `/exports/reports.${format}${qs ? `?${qs}` : ''}`;
}

// exposedHeaders: ['Content-Disposition'] en main.ts (D6) es lo único que
// permite leer esta cabecera desde JS -- sin eso el navegador la oculta
// aunque venga en la respuesta.
function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch ? plainMatch[1] : fallback;
}

async function parseExportError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // Sin body JSON parseable -- se cae al mensaje genérico de abajo.
  }
  return 'Ocurrió un error inesperado exportando. Intentá de nuevo.';
}

export function useDownloadExport() {
  const { authFetch } = useAdminAuth();

  return async function downloadExport(format: ExportFormat, filters: ExportFilters): Promise<void> {
    const res = await authFetch(buildExportUrl(format, filters));
    if (!res.ok) throw new ApiError(await parseExportError(res), res.status);

    const blob = await res.blob();
    const filename = filenameFromContentDisposition(
      res.headers.get('Content-Disposition'),
      `callreport_reportes.${format}`,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}
