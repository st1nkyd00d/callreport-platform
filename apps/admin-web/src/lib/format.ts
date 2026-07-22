export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} hora${diffH === 1 ? '' : 's'}`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} día${diffD === 1 ? '' : 's'}`;
}

export function minutesRemainingInWindow(createdAtIso: string, windowMinutes: number): number {
  const elapsedMin = (Date.now() - new Date(createdAtIso).getTime()) / 60_000;
  return Math.ceil(windowMinutes - elapsedMin);
}

export function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
