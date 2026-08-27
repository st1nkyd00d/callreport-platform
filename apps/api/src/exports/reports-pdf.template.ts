// Resumen ejecutivo en PDF (plan.md Fase 7). Fuentes estándar del PDF
// (Helvetica), sin TTF embebidos -- cero binarios en el repo, cero config
// de build (plan-fase-7.md D5). Verificado a mano con acentos/ñ/¿¡
// (scripts/verify-pdfmake.ts) antes de escribir este archivo: pdfmake
// 0.3.x resuelve nombres de fuente estándar sin pasar por el URLResolver
// si no coinciden con http(s)://, así que 'Helvetica' llega intacto hasta
// pdfkit, que sí la reconoce como una de las 14 fuentes base del PDF.
import pdfMake from 'pdfmake';

pdfMake.setFonts({
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

// Este documento nunca referencia imágenes/archivos externos -- denegar
// todo por defecto evita un SSRF/lectura de archivo local si algún día
// alguien agrega un campo con datos de usuario a un `images`/`files` del
// docDefinition sin pensarlo. También apaga el warning de pdfmake en cada
// llamada (antes ensuciaba los logs de cada request).
//
// Gotcha: pdfmake trata los NOMBRES de fuente estándar (p.ej.
// 'Helvetica-Bold') como si fueran paths de archivo local -- provideFont()
// los pasa por validateLocalFile() igual que un TTF real. Con la política
// en `() => false` a secas, encender el policy rompe las propias fuentes
// estándar que este documento usa. Hay que permitir explícitamente esos
// 14 nombres y denegar cualquier otra cosa (que sí sería un path real).
const STANDARD_14_FONT_NAMES = new Set([
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Symbol',
  'ZapfDingbats',
]);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((path: string) =>
  STANDARD_14_FONT_NAMES.has(path),
);

export interface ReportsPdfData {
  tenantLabel: string;
  rangeLabel: string;
  generatedAt: string;
  total: number;
  byDisposition: { label: string; count: number }[];
  rows: {
    createdAt: string;
    campaign: string;
    disposition: string;
    contactName: string;
    agent: string;
  }[];
  truncated: boolean;
}

export async function buildReportsPdfDocument(
  data: ReportsPdfData,
): Promise<Buffer> {
  const doc = pdfMake.createPdf({
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    pageMargins: [40, 60, 40, 40],
    info: { title: `CallReport — ${data.tenantLabel}` },
    content: [
      { text: 'CallReport — Resumen ejecutivo', fontSize: 16, bold: true },
      { text: data.tenantLabel, fontSize: 12, margin: [0, 2, 0, 0] },
      { text: `Período: ${data.rangeLabel}`, fontSize: 9, color: '#555555' },
      {
        text: `Generado: ${data.generatedAt}`,
        fontSize: 9,
        color: '#555555',
        margin: [0, 0, 0, 12],
      },

      {
        text: 'Totales por tipificación',
        fontSize: 12,
        bold: true,
        margin: [0, 0, 0, 6],
      },
      {
        columns: [
          {
            width: 'auto',
            table: {
              body: [
                [
                  { text: 'Total', bold: true },
                  { text: String(data.total), bold: true },
                ],
                ...data.byDisposition.map((d) => [d.label, String(d.count)]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ],
        margin: [0, 0, 0, 16],
      },

      {
        text: 'Detalle de reportes',
        fontSize: 12,
        bold: true,
        margin: [0, 0, 0, 6],
      },
      data.rows.length
        ? {
            table: {
              headerRows: 1,
              widths: ['auto', '*', '*', '*', '*'],
              body: [
                [
                  { text: 'Fecha', bold: true },
                  { text: 'Campaña', bold: true },
                  { text: 'Tipificación', bold: true },
                  { text: 'Contacto', bold: true },
                  { text: 'Agente', bold: true },
                ],
                ...data.rows.map((r) => [
                  r.createdAt,
                  r.campaign,
                  r.disposition,
                  r.contactName,
                  r.agent,
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            fontSize: 8,
          }
        : { text: 'Sin reportes en el período seleccionado.', italics: true },
      data.truncated
        ? {
            text: 'Se muestran los primeros 200 reportes. Descargue el CSV para el detalle completo.',
            italics: true,
            fontSize: 8,
            margin: [0, 8, 0, 0],
          }
        : undefined,
    ].filter(Boolean),
  });
  return doc.getBuffer();
}
