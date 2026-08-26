// Fuente única del set de tipificaciones por defecto dentro de apps/api
// (backend + prisma/seed.ts la importan desde acá). Duplicado a propósito
// de packages/shared/src/constants.ts -- ver comentario en
// apps/mobile/src/lib/session.ts: el runtime de Nest compilado
// (nest build / node dist/main) no resuelve el "main": "src/index.ts" de
// ese paquete sin un paso de build propio. Si cambia esta lista, actualizar
// también constants.ts en packages/shared.
export const DEFAULT_DISPOSITIONS = [
  {
    code: 'venta',
    label: 'Venta Completada',
    requiresFollowup: false,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'success',
    icon: 'check_circle',
  },
  {
    code: 'cita',
    label: 'Cita Agendada',
    requiresFollowup: true,
    requiresDetail: false,
    requiresSchedule: true,
    color: 'teal',
    icon: 'event_available',
  },
  {
    code: 'consulta',
    label: 'Consulta Resuelta',
    requiresFollowup: false,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'primary',
    icon: 'support_agent',
  },
  {
    code: 'mensaje',
    label: 'Mensaje Tomado',
    requiresFollowup: true,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'warning',
    icon: 'sticky_note_2',
  },
  {
    code: 'seguimiento',
    label: 'Seguimiento Pendiente',
    requiresFollowup: true,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'warning',
    icon: 'schedule',
  },
  {
    code: 'reclamo',
    label: 'Reclamo / Queja',
    requiresFollowup: true,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'error',
    icon: 'report_problem',
  },
  {
    code: 'no_interesado',
    label: 'No Interesado',
    requiresFollowup: false,
    requiresDetail: false,
    requiresSchedule: false,
    color: 'neutral',
    icon: 'do_not_disturb',
  },
  {
    code: 'otro',
    label: 'Otro',
    requiresFollowup: false,
    requiresDetail: true,
    requiresSchedule: false,
    color: 'purple',
    icon: 'more_horiz',
  },
] as const;
