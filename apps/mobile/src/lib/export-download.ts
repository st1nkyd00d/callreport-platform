import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from './api-config';
import type { ReportFilters } from './client-types';

export type ExportFormat = 'csv' | 'pdf';

function buildExportUrl(format: ExportFormat, filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.dispositionIds?.length) {
    params.set('dispositionId', filters.dispositionIds.join(','));
  }
  const qs = params.toString();
  return `${API_BASE_URL}/exports/reports.${format}${qs ? `?${qs}` : ''}`;
}

// Descarga con Authorization: Bearer -- nunca un ?token= en la query (D6,
// plan-fase-7.md): terminaría en logs de acceso, historial del navegador
// y el Referer. `idempotent: true` porque exportar dos veces seguidas con
// el mismo formato/rango reusa el mismo nombre de archivo local.
async function downloadWithToken(url: string, filename: string, accessToken: string): Promise<File> {
  const destination = new File(Paths.cache, filename);
  return File.downloadFileAsync(url, destination, {
    headers: { Authorization: `Bearer ${accessToken}` },
    idempotent: true,
  });
}

function looksLikeUnauthorized(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b/.test(message);
}

export interface ExportReportsOptions {
  format: ExportFormat;
  filters: ReportFilters;
  accessToken: string;
  // Esta descarga NO pasa por authFetch() (File.downloadFileAsync no
  // acepta un fetch custom) -- así que no hereda su reintento-en-401. Si
  // el access token venció justo acá, se refresca UNA vez a mano.
  refreshAccessToken: () => Promise<string>;
}

// Devuelve el File descargado -- el caller decide si compartirlo
// (exportReportsAndShare) o solo inspeccionarlo (tests/debug).
export async function downloadReportsExport({
  format,
  filters,
  accessToken,
  refreshAccessToken,
}: ExportReportsOptions): Promise<File> {
  const url = buildExportUrl(format, filters);
  const filename = `callreport_${Date.now()}.${format}`;

  try {
    return await downloadWithToken(url, filename, accessToken);
  } catch (err) {
    if (!looksLikeUnauthorized(err)) throw err;
    const freshToken = await refreshAccessToken();
    return downloadWithToken(url, filename, freshToken);
  }
}

const MIME_TYPE: Record<ExportFormat, string> = {
  csv: 'text/csv',
  pdf: 'application/pdf',
};

// UTI (iOS) -- D6/plan.md: expo-file-system + expo-sharing, share sheet
// del sistema (correo, Drive, etc.).
const UTI: Record<ExportFormat, string> = {
  csv: 'public.comma-separated-values-text',
  pdf: 'com.adobe.pdf',
};

export async function exportReportsAndShare(options: ExportReportsOptions): Promise<void> {
  const file = await downloadReportsExport(options);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Este dispositivo no puede compartir archivos');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: MIME_TYPE[options.format],
    UTI: UTI[options.format],
  });
}
