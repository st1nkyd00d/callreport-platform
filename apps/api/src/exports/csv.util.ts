// Utilidades CSV genéricas (Fase 7, plan-fase-7.md D3). Sin conocimiento
// de CallReport ni de ningún otro modelo -- el mapeo de columnas vive en
// exports.service.ts.

// Excel/Sheets interpreta como fórmula cualquier celda que arranque con
// =, +, -, @ o un tab/CR. Las notas/detalle/contacto son texto libre
// escrito por agentes -- pueden empezar así por accidente (una nota que
// dice "-5 min de retraso") o a propósito (inyección de fórmulas). Se
// prefija con ' para neutralizarlo: mismo estándar que sostiene el resto
// del proyecto, el límite real vive en el servidor, no en la UI que lo
// abre después.
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Una fila CSV = una línea: los saltos de línea de las notas se
  // convierten en espacio en vez de romper el parseo de la fila.
  text = text.replace(/\r\n|\r|\n/g, ' ');
  if (FORMULA_PREFIX_RE.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

// BOM UTF-8: sin él, Excel abre acentos/ñ como caracteres corruptos.
export const CSV_BOM = '﻿';

export const CSV_LINE_BREAK = '\r\n';
