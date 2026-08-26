// Helpers de sanitización usados por los DTOs de reportes (Fase 4,
// plan.md: "notes sanitizada: trim + longitud máx 5000 + strip de HTML").
// Se aplican vía @Transform de class-transformer en el DTO, no en el
// servicio, para que los validadores de longitud (@MaxLength) corran
// sobre el texto ya limpio.

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

export function sanitizeNotes(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return stripHtml(value).trim();
}

// Deja solo dígitos y un '+' inicial opcional (formato E.164-ish sin
// validar el prefijo de país -- el call center opera con números
// locales e internacionales mezclados).
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const sign = trimmed.startsWith('+') ? '+' : '';
  return sign + trimmed.replace(/[^0-9]/g, '');
}
