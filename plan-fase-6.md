# Plan de implementación — FASE 6

> Push, cola de seguimientos y métricas de agentes.
> Detalle de ejecución de la Fase 6 de `plan.md`. El plan maestro define el **qué**;
> este archivo define el **cómo**, los bloqueadores encontrados al revisar el código
> ya escrito (Fases 1–5) y las decisiones tomadas antes de empezar.
> Al terminar, la bitácora va a `PROGRESS.md` (ver `CLAUDE.md`).

---

## 0. Estado de partida (lo que ya existe y condiciona la fase)

| Pieza | Estado | Implicancia para Fase 6 |
|---|---|---|
| `PushToken` (schema) | Existe desde Fase 1, **sin usar** | Le falta un flag de baja (ver D1) |
| `push_tokens` (RLS) | **Sin RLS**; `app_user` tiene SELECT/INSERT/UPDATE libre | Hay que cerrarla (D1) |
| `CallReport.followupResolvedAt/By` | Columnas existen, nadie las escribe | El seed ya genera pendientes y resueltos (`seed.ts:295`) |
| `call_reports` UPDATE para `client_user` | **No existe la política** | Bloqueante: `resolve` afectaría 0 filas (D2) |
| `RealtimeGateway` | `report.created` / `report.updated` | Sumar `followup.resolved` |
| `PrismaService.forUser()` | Solo cubre operaciones **con modelo** | Bloqueante para métricas y para push (D3, D4) |
| `AuditInterceptor` | Acción derivada del método HTTP | Necesita override para `resolve_followup` |
| `(client)/_layout.tsx` | `Stack` | Pasa a `Tabs` (ya está anotado en el código como trabajo de Fase 6) |
| `MetricasPage` (admin-web) | Recharts completo sobre `AppStore` mock | Se conserva la UI, se cambia la fuente de datos |
| `apps/mobile` | Sin `expo-notifications`, sin `projectId` de EAS | Ver bloqueante D5 |

---

## 1. Decisiones y bloqueadores (resolver antes de escribir código)

### D1 — `push_tokens`: baja lógica y RLS propia

`app_user` **nunca tiene `GRANT DELETE`** (`prisma/init/01-roles.sql`), así que
`DELETE /push/register` y la limpieza de tokens inválidos no pueden borrar filas.

**Decisión:** agregar `revokedAt DateTime?` a `PushToken` (mismo criterio que
`RefreshToken.revokedAt`, `CampaignAgent.isActive`, `Shift.endedAt`). Dar de baja
= sellar `revokedAt`. Re-registrar el mismo token = `upsert` que lo reactiva
(`revokedAt: null`) y reasigna `userId` (un dispositivo puede cambiar de dueño).

Además la tabla hoy no tiene RLS: cualquier rol podría leer los tokens de todos.
Se enciende `ENABLE`/`FORCE ROW LEVEL SECURITY` con dos políticas:
`push_tokens_self_all` (cada usuario solo sus filas, por `app.user_id`) y
`push_tokens_staff_all` (staff, que es por donde entra el emisor de push — ver D3).

### D2 — El cliente no puede resolver seguimientos sin una política de UPDATE

Mismo hueco que se descubrió en Fase 4 con el agente: existe
`call_reports_agent_update` y `call_reports_staff_all`, pero **nada para
`client_user`**. Con `FORCE ROW LEVEL SECURITY`, `POST /followups/:id/resolve`
hecho por un cliente actualizaría 0 filas en silencio.

**Decisión:** nueva política `call_reports_client_update` (rol `client_user`,
`tenant_id = app.tenant_id` en `USING` y `WITH CHECK`).

Pero una política de UPDATE es todo-o-nada por fila: no puede limitar *qué
columnas* toca. Sin nada más, un cliente con esa política podría reescribir las
notas o el contacto de cualquier reporte de su tenant si alguna vez aparece otro
endpoint de UPDATE.

**Decisión:** agregar un trigger `BEFORE UPDATE` en `call_reports` que, cuando
`app.role = 'client_user'`, rechace cualquier cambio fuera de
`followup_resolved_at` / `followup_resolved_by` / `updated_at`:

```sql
IF to_jsonb(NEW) - '{followup_resolved_at,followup_resolved_by,updated_at}'::text[]
   IS DISTINCT FROM
   to_jsonb(OLD) - '{followup_resolved_at,followup_resolved_by,updated_at}'::text[]
THEN RAISE EXCEPTION ...
```

Es el mismo estándar que viene sosteniendo el proyecto: la regla de negocio da el
mensaje lindo en el servicio, **la base es el límite real**.

### D3 — El push necesita un contexto de sistema (`forSystem()`)

Cuando un **agente** crea un reporte, el backend tiene que resolver *a quién
notificar*: los `client_user` del tenant (tabla `tenant_memberships`, con RLS) y
sus `push_tokens`. Bajo `forUser(agente)` eso devuelve **cero filas** — el agente
no tiene ninguna política sobre `tenant_memberships`. Y el cliente base de
`PrismaService` tampoco sirve: se conecta como `app_user` sin GUC seteados, o sea
también cero filas (ese es justamente el criterio "sin settings → cero filas").

**Decisión:** agregar `PrismaService.forSystem()`, que usa el mismo interceptor
que `forUser()` pero fija `app.role = 'super_admin'` y `app.user_id = 'system'`,
reutilizando las políticas `*_staff_all` ya existentes. Se extrae un
`withContext(ctx)` privado del que salen `forUser()` y `forSystem()`.

**Regla de código (documentada en el archivo y en `PROGRESS.md`):** el único
consumidor legítimo de `forSystem()` es `NotificationsService` (targeting de push
y baja de tokens inválidos), igual que `AuthService` es la única excepción
documentada al uso del cliente crudo. El grep de CI previsto en Fase 8 tiene que
cubrir también `forSystem`.

*Alternativa descartada:* un rol `notifier` con políticas propias en cada tabla —
más superficie de SQL y más para mantener, sin beneficio real a esta escala.

### D4 — Métricas: `forUser()` no sirve para SQL crudo (gotcha ya anotado en Fase 5)

`plan.md` pide agregados con `GROUP BY` + `date_trunc`. `forUser()` **no fija los
GUC para `$queryRaw`** (rama `if (!model)` en `prisma.service.ts`).

**Decisión:** implementar `forUserRaw(user, fn)`: abre una transacción, corre el
`set_config` a mano y le pasa el `tx` al callback. `MetricsService` es su único
consumidor en esta fase; **el streaming del CSV de Fase 7 lo va a reutilizar**, así
que la inversión se amortiza.

`date_trunc('day', ...)` trunca en UTC. **Decisión:** los endpoints aceptan `tz`
(IANA) y el default sale de `METRICS_TZ` en `.env`, con
`America/Argentina/Buenos_Aires` como valor inicial —
`date_trunc('day', created_at AT TIME ZONE $tz)`. Sin esto, "volumen por día" en
el panel no coincide con lo que el cliente ve como "Hoy" en el móvil.

### D5 — Push real necesita un development build (no Expo Go) y un `projectId` de EAS

Dos restricciones de la plataforma, no del código:

1. `Notifications.getExpoPushTokenAsync()` exige un **`projectId` de EAS**. Hoy
   `apps/mobile/app.json` no tiene `extra.eas.projectId` ni `owner`. Hay que
   correr `npx eas init` con la cuenta Expo del proyecto (paso manual, del usuario).
2. Expo Go dejó de entregar **push remoto** (SDK 53+); en SDK 57 hace falta un
   *development build* (`eas build --profile development`) para recibir
   notificaciones reales, más credenciales FCM (Android) / APNs (iOS).

**Decisión:** se implementa todo el código de la fase, y la verificación se parte
en dos:
- *Verificable ahora*: registro/baja del token contra el API, targeting correcto,
  limpieza de tokens inválidos, deep link (probado con
  `Notifications.scheduleNotificationAsync` local, que **sí** funciona en Expo Go).
- *Deferido a un dev build*: el criterio "app cerrada en dispositivo físico → llega
  el push". Se documenta en `PROGRESS.md` igual que se hizo con los criterios de
  dispositivo físico de las Fases 1–5, y se enlaza con la tarea de EAS de Fase 8.

Si el código detecta que no hay `projectId` o que corre en Expo Go, el registro
hace *no-op* con un log claro en vez de crashear.

### D6 — Receipts de Expo: sin tabla nueva ni scheduler

Los receipts de Expo se consultan ~15 min después del envío. Opciones: tabla
`push_tickets` + cron (`@nestjs/schedule`), o retención en memoria.

**Decisión:** en memoria. `PushService` guarda `Map<ticketId, pushTokenId>` y
programa un `setTimeout` (con `.unref()`) para consultarlos; además procesa los
errores que Expo ya devuelve en el **ticket** (que es donde suele aparecer
`DeviceNotRegistered`) de forma inmediata. `checkReceipts()` queda público para
que el test e2e lo invoque directo.

*Limitación aceptada y documentada:* los receipts pendientes se pierden si el
proceso reinicia. A esta escala no importa — el mismo token inválido vuelve a
fallar en el siguiente envío y ahí se da de baja. La tabla + cron queda anotada
como optimización futura, igual que las tablas de resumen de métricas.

### D7 — Logout tiene que dar de baja el token del dispositivo

No está en `plan.md` pero es un agujero de aislamiento entre tenants: si un
`client_user` de Acme cierra sesión y en el mismo teléfono entra uno de Globex,
el token sigue apuntando al usuario anterior y **Acme recibiría notificaciones en
el dispositivo de Globex**. `logout()` en `auth-context.tsx` llama
`DELETE /push/register` antes de limpiar la sesión.

---

## 2. Trabajo por bloques

### Bloque A — Base de datos (1 migración)

`prisma/migrations/20260827xxxxxx_push_tokens_and_followup_rls/migration.sql`

1. `ALTER TABLE push_tokens ADD COLUMN revoked_at TIMESTAMP(3)` + índice parcial
   `(user_id) WHERE revoked_at IS NULL`.
2. `push_tokens`: `ENABLE` + `FORCE ROW LEVEL SECURITY`; políticas
   `push_tokens_self_all` y `push_tokens_staff_all` (D1).
3. `call_reports_client_update` (D2).
4. Función + trigger `enforce_client_followup_only()` en `call_reports` (D2).

`schema.prisma`: `revokedAt DateTime? @map("revoked_at")` en `PushToken`.

Flujo: agregar el campo → `npx prisma migrate dev --create-only` → **editar a mano**
el `migration.sql` agregando el SQL de RLS/trigger (mismo procedimiento que las
migraciones de Fase 1/3/4) → `migrate deploy` contra Neon → `prisma generate`.

**Verificación manual** (script Node con `pg` como `app_user`, igual que en Fase 4,
porque no hay `psql` en este entorno):
- Con `app.role='client_user'` + tenant de Acme: `UPDATE call_reports SET followup_resolved_at=now()` sobre un reporte de Acme → 1 fila; sobre uno de Globex → 0 filas.
- Mismo contexto, `UPDATE ... SET notes='x'` → excepción del trigger.
- Con `app.role='agent'`: `SELECT * FROM push_tokens` de otro usuario → 0 filas.

### Bloque B — `PrismaService` (2 métodos)

`apps/api/src/prisma/prisma.service.ts`
- Extraer `private withContext({userId, role, tenantId})` (el `$extends` actual).
- `forUser(user)` → `withContext(...)` (sin cambio de comportamiento).
- `forSystem()` → `withContext({ userId: 'system', role: 'super_admin' })` + comentario con la regla de uso (D3).
- `forUserRaw(user, fn)` → transacción + `set_config` + callback (D4).

### Bloque C — `NotificationsModule`

`apps/api/src/notifications/`

| Archivo | Contenido |
|---|---|
| `notifications.module.ts` | Exporta `NotificationsService`; lo importa `ReportsModule` |
| `push.service.ts` | Wrapper de `expo-server-sdk`: validación de formato, `chunkPushNotifications`, envío, tickets, `checkReceipts()`, baja de tokens con `DeviceNotRegistered`. Inyectable → los tests lo sustituyen |
| `notifications.service.ts` | Targeting + textos: `notifyReportCreated(report)` |
| `push-tokens.controller.ts` | `POST /push/register`, `DELETE /push/register` |
| `dto/register-push-token.dto.ts` | `token` (validado con `Expo.isExpoPushToken`), `platform` (`ios`\|`android`) |

Targeting de `notifyReportCreated` (vía `forSystem()`):
- `client_user` activos del `tenantId` del reporte → «Nuevo reporte de llamada» / «{campaña} — {contacto}».
- Si `disposition.requiresFollowup`: además todos los `supervisor` activos → «Seguimiento pendiente — {campaña}».
- `data: { type, reportId, tenantId }` → lo consume el deep link.

Enganche en `ReportsService.create()`, **después** del `emitReportCreated` y del
INSERT confirmado, en fire-and-forget con `.catch()` + log: una caída de la API de
Expo nunca puede tumbar un 201 de reporte.

Dependencias nuevas: `expo-server-sdk` en `apps/api`.
`.env` / `.env.example`: `EXPO_ACCESS_TOKEN` (opcional), `PUSH_ENABLED` (default `true`).

> Nota sobre supervisores: hoy `homeRouteForRole()` manda a cualquier rol no-cliente
> a la sección del agente, así que un supervisor **puede** loguearse en el móvil y
> registrar token. Si ninguno lo hace, el push a supervisores simplemente no tiene
> destinatarios; el targeting igual se prueba en el e2e.

### Bloque D — `FollowupsModule`

`apps/api/src/followups/`

- `GET /followups?status=pending|resolved&limit&after` — `client_user` y staff.
  `where: { disposition: { requiresFollowup: true }, followupResolvedAt: null | { not: null } }`.
  Orden: pendientes por `scheduledAt asc` (nulls last) y luego `createdAt desc`
  (mismo criterio que el mock `SeguimientosPage.tsx`); resueltos por
  `followupResolvedAt desc`. Cursor por `id`, igual que `GET /reports`.
- `GET /followups/count` → `{ pending: n }` para el badge del tab.
- `POST /followups/:reportId/resolve`:
  - 404 si RLS no lo deja ver; 400 si la tipificación no requiere seguimiento;
    **409 si ya estaba resuelto** (idempotencia explícita, no silenciosa).
  - Sella `followupResolvedAt` + `followupResolvedBy`.
  - `@AuditEntity('CallReport')` + `@AuditAction('resolve_followup')`.
  - Emite `followup.resolved` por el gateway.

Cambios de apoyo:
- `audit/audit-entity.decorator.ts`: sumar `AuditAction(action)`; el interceptor
  usa el metadata si existe, y si no cae al mapa por método HTTP actual.
- `realtime/realtime.gateway.ts`: `emitFollowupResolved(report)` → rooms
  `tenant:{tenantId}` + `staff`.

### Bloque E — `MetricsModule`

`apps/api/src/metrics/`, `@Roles('super_admin','supervisor')` a nivel de clase,
todo vía `forUserRaw()`.

- `GET /admin/metrics/agents?from&to&tz`
  - Query 1: `GROUP BY agent_id, disposition_id` (join `dispositions` por label/code).
  - Query 2: horas activas por agente desde `shifts`
    (`SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)))/3600`, recortado al rango).
  - Combinación en JS → `{ agentId, fullName, total, perActiveHour, byDisposition[] }`.
- `GET /admin/metrics/overview?from&to&tz`
  - `byDay` (`date_trunc('day', created_at AT TIME ZONE $tz)`), `byTenant`, `byCampaign`.
  - KPIs que hoy salen del mock: `totalReports`, `activeTenants`, `pendingFollowups`, `agentsOnShift`.
- DTO de rango con `@IsISO8601` opcional; default: últimos 30 días.
- `count(*)` de Postgres vuelve como `BigInt` → mapear a `Number` en el borde del
  servicio (si no, `JSON.stringify` revienta).

### Bloque F — Móvil

1. `npx expo install expo-notifications` + plugin en `app.json` (ícono, color,
   canal Android `default` con importancia MAX). **Paso manual del usuario:**
   `npx eas init` para tener `extra.eas.projectId` (D5).
2. `src/lib/push.ts` — `registerForPushNotifications()`: `Device.isDevice`,
   permisos (solo si están `undetermined`), `getExpoPushTokenAsync({ projectId })`,
   `POST /push/register`. Sin `projectId` o en Expo Go → no-op con log.
3. `usePushRegistration()` llamado desde `(agent)/_layout.tsx` y
   `(client)/_layout.tsx` — ambos montan **solo después del login**, que es lo que
   pide `plan.md` ("no en el arranque").
4. Deep link en `src/app/_layout.tsx`:
   `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync()`
   (arranque en frío) → `router.push('/(client)/reporte/' + data.reportId)`.
5. `(client)/_layout.tsx`: `Stack` → `Tabs` (`dashboard`, `seguimientos`,
   `reporte/[id]` con `href: null`), `tabBarBadge` desde `useFollowupsCount()`.
6. `(client)/seguimientos.tsx`: selector Pendientes/Resueltos, tarjetas reusando
   `report-card.tsx`, resaltado de vencidos (`scheduledAt < now`), botón
   "Marcar como resuelto" con confirmación. **Botón, no swipe** — más accesible y
   sin sumar gestos; el swipe queda anotado como mejora opcional.
7. `client-queries.ts`: `useFollowups(status)`, `useFollowupsCount()`,
   `useResolveFollowup()` (invalida `followups`, `followups-count`, `client-reports`).
8. `realtime.tsx`: escuchar `followup.resolved` e incluir las claves de
   seguimientos en `invalidateAll()`.
9. `auth-context.tsx`: `logout()` da de baja el token push (D7).

### Bloque G — Admin-web

- `src/api/metrics.ts`: hooks TanStack Query contra los dos endpoints nuevos.
- `MetricasPage.tsx`: se **conserva** toda la UI de Recharts (barras por agente,
  línea de volumen diario, dona de tipificaciones, tabla comparativa) y se
  reemplaza `useStore()` por los hooks reales; selector de rango (7/30/90 días +
  personalizado) que alimenta `from`/`to`.
- Fuera de alcance (siguen en mock, se anota en `PROGRESS.md`): `TurnosPage`
  (necesita el clock-out de supervisor, que no tiene endpoint) y `AuditoriaPage`
  (visor de auditoría = Fase 7).

### Bloque H — Tests e2e

Tres suites nuevas (`--runInBand` ya configurado; quedan 8 suites en total):

- `test/push-notifications.e2e-spec.ts`
  - registrar token → aparece en `push_tokens`; re-registrar el mismo token →
    upsert, no duplica y limpia `revokedAt`; `DELETE` → `revokedAt` sellado.
  - token con formato inválido → 400.
  - un usuario no ve/da de baja el token de otro (política `push_tokens_self_all`).
  - **targeting**: creado un reporte, `NotificationsService` resuelve exactamente
    los `client_user` del tenant dueño (y ninguno del otro tenant); con
    `requiresFollowup`, además los supervisores. `PushService` sustituido por un
    doble que captura los mensajes.
  - **receipts**: `checkReceipts()` con un receipt `DeviceNotRegistered` simulado
    → el token queda con `revokedAt` (criterio de aceptación 2).
- `test/followups.e2e-spec.ts`
  - listado pendientes/resueltos contra el conteo real del seed vía `forUser()`.
  - resolver como `client_user` → 200, sella quién y cuándo, fila en `audit_logs`
    con `action='resolve_followup'`, y el socket del tenant recibe
    `followup.resolved` (el listener se registra **antes** de disparar el POST —
    gotcha de timing documentado en Fase 5).
  - reporte de otro tenant → 404; segundo resolve → 409; reporte cuya tipificación
    no requiere seguimiento → 400.
  - un `client_user` no puede modificar otras columnas (prueba directa del trigger).
- `test/metrics.e2e-spec.ts`
  - `client_user` y `agent` → 403.
  - totales por agente y `byDay` contrastados contra `groupBy`/`count` de Prisma
    sobre el mismo rango (una consulta de control por gráfico, como pide el criterio 4).

---

## 3. Orden de ejecución

```
A (migración + verificación SQL a mano)
└─ B (forSystem / forUserRaw)
   ├─ C (Notifications)  ──┐
   ├─ D (Followups)      ──┼─→ H backend (3 suites verdes)
   └─ E (Metrics)        ──┘
                            ├─→ F (móvil: push + tab Seguimientos)
                            └─→ G (admin-web: Métricas real)
                                 └─→ PROGRESS.md (bitácora Fase 6)
```

Checkpoints donde conviene parar y verificar antes de seguir:
1. Después de **A**: las tres pruebas SQL a mano contra Neon.
2. Después de **H backend**: `npm run test:e2e` con las 8 suites verdes.
3. Después de **F/G**: `tsc --noEmit` + `expo lint` en móvil, `tsc -b && vite build` en admin-web.

---

## 4. Cómo se verifica cada criterio de aceptación

| Criterio de `plan.md` | Cómo se cubre |
|---|---|
| Dispositivo físico, app cerrada: llega push, tocarla abre el detalle; seguimiento también notifica al supervisor | **Parcial.** Targeting y textos con test e2e; deep link probado con notificación local en Expo Go. El envío real a un dispositivo con la app cerrada **requiere un dev build de EAS** (D5) → se deja explícitamente deferido y anotado |
| Token inválido simulado se elimina de `push_tokens` tras procesar receipts | Test e2e de `checkReceipts()` (baja lógica: `revokedAt`, no `DELETE` — D1) |
| Flujo de seguimiento completo (pendiente → resuelto → auditado → badge en tiempo real) | Test e2e (`followups.e2e-spec.ts`) para backend + socket; el badge se verifica a mano en el móvil |
| Métricas contrastadas contra el seed, una consulta de control por gráfico | `metrics.e2e-spec.ts` |

---

## 5. Riesgos y deferidos previstos

- **Push real depende de EAS** (D5): es la única parte de la fase que no se puede
  cerrar sin un paso de infraestructura del usuario (`eas init` + build de
  desarrollo + credenciales FCM/APNs). Es trabajo que Fase 8 ya tiene planificado.
- **Receipts en memoria** (D6): se pierden si el proceso reinicia.
- **`forSystem()` amplía la superficie de riesgo**: es un contexto con privilegios
  de staff. Mitigación: un único consumidor, comentado en el código, y el grep de
  CI de Fase 8 extendido para cubrirlo.
- **Zona horaria de las métricas** (D4): si el call center opera en otro huso, hay
  que cambiar `METRICS_TZ`; el default no es neutral y se documenta.
- **Deuda que NO se toca en esta fase**: `TurnosPage` y `AuditoriaPage` siguen
  sobre mocks; el cursor combinado de "Próximas citas" sigue sin generalizar; CORS
  del API y del gateway siguen abiertos (Fase 8).
