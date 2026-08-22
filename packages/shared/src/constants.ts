import type { DispositionCode } from './types';

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Propietario',
  supervisor: 'Supervisor',
  agent: 'Agente',
  client_user: 'Cliente',
};

export const DEFAULT_EDIT_WINDOW_MINUTES = 30;

export interface DefaultDispositionSeed {
  code: DispositionCode;
  label: string;
  requiresFollowup: boolean;
  requiresDetail: boolean;
  requiresSchedule: boolean;
  color: 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'purple' | 'teal';
  icon: string;
}

// Fuente única del set de tipificaciones por defecto que recibe cada
// campaña nueva. Usado por el mock de admin-web (AppStore/mocks/seed) y por
// la UI (formularios, pantalla de configuración). apps/api/prisma/seed.ts
// mantiene su propia copia standalone (ver comentario ahí) — si cambia esta
// lista, actualizar también esa.
export const DEFAULT_DISPOSITIONS: DefaultDispositionSeed[] = [
  { code: 'venta', label: 'Venta Completada', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'success', icon: 'check_circle' },
  { code: 'cita', label: 'Cita Agendada', requiresFollowup: true, requiresDetail: false, requiresSchedule: true, color: 'teal', icon: 'event_available' },
  { code: 'consulta', label: 'Consulta Resuelta', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'primary', icon: 'support_agent' },
  { code: 'mensaje', label: 'Mensaje Tomado', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'warning', icon: 'sticky_note_2' },
  { code: 'seguimiento', label: 'Seguimiento Pendiente', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'warning', icon: 'schedule' },
  { code: 'reclamo', label: 'Reclamo / Queja', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'error', icon: 'report_problem' },
  { code: 'no_interesado', label: 'No Interesado', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'neutral', icon: 'do_not_disturb' },
  { code: 'otro', label: 'Otro', requiresFollowup: false, requiresDetail: true, requiresSchedule: false, color: 'purple', icon: 'more_horiz' },
];
