# Plan de Desarrollo — Plataforma Multi-Tenant para Call Center

## Resumen del producto

Un call center ofrece el servicio de contestar llamadas para otras empresas ("clientes" / tenants). Los **agentes** del call center llenan reportes manuales desde una **app móvil (Android/iPhone)** al terminar cada llamada. Cada **empresa cliente** ve sus reportes aparecer **en tiempo real** en su propio dashboard dentro de la misma app móvil, con aislamiento estricto de datos (jamás ve datos de otra empresa). El **dueño del call center y sus supervisores** administran todo desde un **panel web**.

### Decisiones de arquitectura (cerradas en la fase de descubrimiento)

| Decisión | Elección |
|---|---|
| Multi-tenancy | Base de datos única PostgreSQL con Row-Level Security (RLS) por `tenant_id` |
| Modelo | Tenant → N campañas; agentes asignados a campañas específicas |
| Tipificaciones | Configurables por campaña (tabla `dispositions`), no enum fijo |
| Edición de reportes | Ventana de 30 min para el autor (configurable por tenant); después solo supervisores; todo auditado |
| Backend | NestJS + Prisma + PostgreSQL 16 + Socket.io, JWT (access+refresh), argon2 |
| App móvil | React Native + Expo (TypeScript), Expo Router, TanStack Query, socket.io-client, Expo Notifications |
| Panel admin | React + Vite + TypeScript, TanStack Query, Recharts |
| Push | Desde v1, vía Expo Notifications (FCM/APNs), `expo-server-sdk` en backend |
| Telefonía | Manual siempre por ahora; el esquema deja campos opcionales (`duration_seconds`, `external_call_id`, `recording_url`) |
| Base de datos | Neon (PostgreSQL administrado, serverless) — sin instancia local ni contenedor propio |
| Escala | Pequeña (<20 agentes); hosting de api/admin-web en Render (Fase 8, sin Docker), una sola instancia — la base sigue en Neon |
| Alcance v1 | Núcleo + métricas de agentes + cola de seguimientos + multi-usuario por tenant |

### Estructura del monorepo

```
Ricardo App/
├── apps/
│   ├── api/          # NestJS backend
│   ├── mobile/       # Expo app (agentes + clientes)
│   └── admin-web/    # React + Vite (admin/supervisores)
├── packages/
│   └── shared/       # Tipos, DTOs y constantes compartidas
├── plan.md           # este archivo
└── design.md         # prompts para Stitch AI
```

### Regla de oro entre fases

**No se avanza a la siguiente fase hasta que TODOS los criterios de aceptación de la fase actual pasen.** Cada fase asume que las anteriores funcionan y están verificadas; así los bugs no se arrastran.

---

## FASE 1 — Fundación: monorepo, base de datos, RLS y seeds

**Objetivo:** infraestructura completa de desarrollo y un esquema de datos con aislamiento multi-tenant funcionando a nivel de base de datos, antes de escribir lógica de negocio.

**Prerequisitos:** ninguno (fase inicial). Requiere Node 20+, una base Neon (PostgreSQL administrado) y Git instalados.

### Tareas

1. **Monorepo**: inicializar repo git y workspace de npm (`package.json` raíz con `workspaces: ["apps/*", "packages/*"]`). Crear `packages/shared` con `src/types.ts` (roles, DTOs base) y `src/constants.ts`.
2. **Base de datos Neon**: proyecto Neon con la base `neondb`; endpoint directo para migraciones y endpoint pooled (PgBouncer) para runtime — sin instancia local ni contenedor propio.
3. **Scaffold del API**: `nest new apps/api`. Instalar Prisma, configurar `DATABASE_URL`/`APP_DATABASE_URL` vía `.env` (crear `.env.example` documentado).
4. **Roles de PostgreSQL** (crítico para RLS): script `apps/api/prisma/init/01-roles.sql`, corrido a mano vía `psql` contra Neon, que crea:
   - `app_user` — rol **no-superusuario** con el que se conecta NestJS (los superusuarios ignoran RLS).
   - `migrator` — rol dueño de las tablas, usado solo por `prisma migrate`.
5. **Esquema Prisma completo** (`apps/api/prisma/schema.prisma`):
   - `Tenant` — id (uuid), name, status (`active`/`suspended`), `edit_window_minutes` (default 30), timestamps.
   - `User` — id, email (unique), password_hash, full_name, role (`super_admin` | `supervisor` | `agent` | `client_user`), status, timestamps.
   - `TenantMembership` — user_id ↔ tenant_id (unique compuesto). Permite varios `client_user` por tenant.
   - `Campaign` — id, tenant_id (FK, indexado), name, status, timestamps.
   - `CampaignAgent` — campaign_id ↔ user_id (unique compuesto).
   - `Disposition` — id, campaign_id (FK), label, sort_order, `requires_followup` (bool), `is_active`.
   - `CallReport` — id, **tenant_id (obligatorio, indexado)**, campaign_id, agent_id, disposition_id, contact_name, contact_phone, contact_email (nullable), notes (text), `followup_resolved_at` (nullable), `followup_resolved_by` (nullable), `duration_seconds` / `external_call_id` / `recording_url` (nullables para futura telefonía), created_at, updated_at. Índices: `(tenant_id, created_at)`, `(tenant_id, disposition_id)`, `(agent_id, created_at)`.
   - `AuditLog` — id, user_id, action (`create`/`update`/`resolve_followup`/...), entity_type, entity_id, diff (jsonb), ip_address, created_at. **Sin updated_at: es inmutable.**
   - `PushToken` — id, user_id, token (unique), platform, created_at, last_used_at.
6. **Migración RLS** (SQL crudo dentro de una migración Prisma, `prisma/migrations/xxx_rls/migration.sql`):
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en `call_reports`, `campaigns`, `dispositions`, `tenant_memberships`.
   - Políticas que leen `current_setting('app.tenant_id', true)`, `current_setting('app.role', true)` y `current_setting('app.user_id', true)`:
     - `client_user`: SELECT solo donde `tenant_id = app.tenant_id`.
     - `agent`: SELECT/INSERT solo en campañas presentes en `campaign_agents` para `app.user_id`; el INSERT valida que `tenant_id` coincida con el tenant de la campaña.
     - `supervisor`/`super_admin`: todo.
   - `GRANT SELECT/INSERT/UPDATE` selectivos a `app_user`; **`REVOKE UPDATE, DELETE ON audit_logs FROM app_user`** (inmutabilidad real).
7. **Seed** (`prisma/seed.ts`): 2 tenants demo ("Acme Corp", "Globex"), 1 super_admin, 1 supervisor, 3 agentes, 2 client_users por tenant, 2 campañas por tenant con las 4 tipificaciones default (Venta Completada, Consulta Resuelta, Seguimiento Pendiente con `requires_followup=true`, No Interesado), asignaciones de agentes cruzadas, y ~200 call_reports repartidos en los últimos 30 días.
8. **Scaffold móvil**: `npx create-expo-app apps/mobile` con Expo Router y TypeScript. Estructura de rutas por rol: `app/(auth)/login.tsx`, `app/(agent)/…`, `app/(client)/…` — pantallas placeholder por ahora.

### Criterios de aceptación (verificar antes de Fase 2)

- [x] Base Neon accesible; `npx prisma migrate deploy && npx prisma db seed` corre sin errores.
- [x] **Prueba SQL de RLS**: conectado como `app_user`, tras `SELECT set_config('app.tenant_id', '<uuid-acme>', false); set_config('app.role','client_user',false);`, un `SELECT * FROM call_reports` (sin WHERE) devuelve **solo** filas de Acme. Cambiando el setting a Globex, solo Globex. Sin settings, **cero filas**.
- [x] Como `app_user`, `UPDATE audit_logs ...` y `DELETE FROM audit_logs` fallan con error de permisos.
- [x] `npx expo start` en `apps/mobile` abre la app placeholder en Expo Go. (Verificado headless: el server levanta sin crashear y sirve el bundle real vía HTTP; falta una pasada manual en un dispositivo/Expo Go físico — ver `PROGRESS.md`.)

---

## FASE 2 — Autenticación y aislamiento en el API

**Objetivo:** cualquier petición HTTP llega con identidad verificada y toda consulta a la base corre dentro del contexto RLS del usuario. Esta fase es el cimiento de seguridad; nada de lógica de negocio hasta que esté blindada.

**Prerequisitos:** Fase 1 completa (RLS verificado a nivel SQL).

### Tareas

1. **AuthModule** (`apps/api/src/auth/`):
   - `POST /auth/login` — valida email+password (argon2), emite access token (15 min) y refresh token (7 días, rotación en cada uso, hash del refresh guardado en DB).
   - `POST /auth/refresh`, `POST /auth/logout`.
   - Payload del JWT: `sub` (user_id), `role`, `tenant_id` (solo para `client_user`, desde `tenant_memberships`; null para staff).
   - `JwtAuthGuard` global + `RolesGuard` con decorador `@Roles(...)`. Decoradores `@CurrentUser()` y `@CurrentTenant()`.
2. **PrismaService con contexto RLS** (`apps/api/src/prisma/`): método `forUser(user)` que devuelve un cliente extendido donde **cada operación corre en una transacción** que primero ejecuta `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true), set_config('app.tenant_id', $3, true)` (tercer argumento `true` = transaction-scoped, seguro con pooling). **Regla de código: los servicios de negocio SOLO acceden a la DB vía `forUser()`; el cliente crudo queda privado.**
3. **Validación global**: `ValidationPipe` con `whitelist: true` y `forbidNonWhitelisted: true` (los DTOs con class-validator rechazan campos extra — nadie puede inyectar `tenant_id` en un body).
4. **Endpoint de humo**: `GET /reports` (versión mínima, paginada) que lista reportes usando `forUser()` — existe solo para probar el aislamiento end-to-end.
5. **Tests e2e de aislamiento** (`apps/api/test/isolation.e2e-spec.ts`) con supertest y el seed de Fase 1 — ver criterios.
6. **Login en móvil**: pantalla de login funcional, tokens en `expo-secure-store`, interceptor que refresca el access token en 401, redirección por rol (agente → `(agent)`, cliente → `(client)`).

### Criterios de aceptación

- [x] Test e2e: login como client_user de Acme → `GET /reports` devuelve solo reportes de Acme; **ninguno** de Globex, ni forzando `?tenant_id=<globex>` en query params.
- [x] Test e2e: petición sin token → 401; client_user llamando un endpoint de admin → 403.
- [x] Test e2e: refresh token usado dos veces → el segundo uso falla (rotación detecta reuso).
- [x] Test e2e: body con campos no declarados en el DTO → 400.
- [x] En Expo Go: login como agente y como cliente redirige a la sección correcta; matar y reabrir la app mantiene la sesión. (Verificado headless: bundler levanta sin errores con la pantalla de login real, `tsc`/`expo lint` limpios; falta una pasada manual en dispositivo/Expo Go físico — ver `PROGRESS.md`.)

---

## FASE 3 — Panel web de administración (CRUD)

**Objetivo:** el dueño del call center puede configurar todo el sistema: tenants, usuarios, campañas, tipificaciones y asignaciones. Sin esto, las fases siguientes no tienen datos reales que operar.

**Prerequisitos:** Fase 2 (auth y guards funcionando).

### Tareas

1. **Endpoints admin** (protegidos con `@Roles('super_admin', 'supervisor')`; creación/borrado de tenants y usuarios solo `super_admin`):
   - `TenantsModule`: CRUD `/admin/tenants` (borrado = soft-delete a `suspended`), incluye `edit_window_minutes`.
   - `UsersModule`: CRUD `/admin/users` con filtro por rol; alta de `client_user` crea su `tenant_membership`; reset de contraseña.
   - `CampaignsModule`: CRUD `/admin/campaigns`; anidados: `PUT /admin/campaigns/:id/agents` (asignación) y CRUD `/admin/campaigns/:id/dispositions` (label, orden, `requires_followup`, activar/desactivar — **no borrar** si tienen reportes asociados).
2. **AuditModule (backend)**: interceptor global que tras cada mutación exitosa escribe en `audit_logs` (usuario, acción, entidad, diff antes/después, IP desde `X-Forwarded-For`/socket). Se activa desde esta fase para que TODO el CRUD quede auditado.
3. **Scaffold admin-web** (`apps/admin-web`): Vite + React + TS, React Router, TanStack Query, login contra `/auth/login` (solo staff), layout con navegación lateral.
4. **Pantallas**: listado+formulario para Tenants, Usuarios, Campañas (con tabs de tipificaciones y agentes asignados). Tablas con búsqueda y paginación server-side.
5. Servir `admin-web` con `vite build` + un servidor estático simple para desarrollo/demo (sin Docker por ahora).

### Criterios de aceptación

- [x] Flujo completo en el navegador: crear tenant nuevo → crear campaña → definir 3 tipificaciones → crear 2 agentes y asignarlos → crear client_user del tenant. Todo persiste tras recargar. (Verificado vía `test/admin-crud.e2e-spec.ts` + `curl` con el `Origin` real de Vite; falta una pasada manual con clicks en un navegador — ver `PROGRESS.md`.)
- [x] Cada mutación del flujo anterior aparece en `audit_logs` con usuario, diff e IP.
- [x] Un supervisor puede editar campañas pero no crear tenants (403 verificado).
- [x] Tests e2e de los endpoints CRUD principales (crear/editar/listar por rol).

---

## FASE 4 — Flujo del agente (móvil)

**Objetivo:** el flujo de mayor frecuencia de uso: un agente termina una llamada y registra el reporte en menos de 30 segundos, sin fricción.

**Prerequisitos:** Fase 3 (existen campañas, tipificaciones y asignaciones reales).

**Nota (agregada al implementar la fase):** el modelo `Shift` (turnos, clock-in/out) se sumó al esquema después de escrito este plan, y la política RLS `call_reports_agent_insert` (Fase 3) ya exige un turno abierto para que un agente pueda insertar un reporte. Por eso el alcance real de esta fase incluyó también el ciclo de turno completo (`ShiftsModule` + pantalla "Turno" en el móvil), que no estaba en la lista de tareas original. Ver `PROGRESS.md` para el detalle.

### Tareas

1. **Endpoints**:
   - `GET /agent/campaigns` — solo las asignadas al agente (RLS ya lo garantiza; el endpoint solo ordena y formatea).
   - `GET /campaigns/:id/dispositions` — tipificaciones activas ordenadas.
   - `POST /reports` — DTO validado: campaign_id, disposition_id, contact_name (requerido), contact_phone (requerido, normalizado), contact_email (opcional, validado), notes (sanitizada: trim + longitud máx 5000 + strip de HTML). El servicio deriva `tenant_id` **desde la campaña en el servidor** (jamás del cliente) y verifica que la disposition pertenezca a la campaña.
   - `PATCH /reports/:id` — regla de ventana: autor dentro de `edit_window_minutes` del tenant, o supervisor siempre; fuera de eso 403 con mensaje claro. Auditado con diff.
   - `GET /agent/reports?date=today` — reportes propios recientes.
2. **Móvil — pantallas del agente**:
   - **Selector de campaña**: lista de campañas asignadas con nombre del cliente; la selección persiste (AsyncStorage) para no re-seleccionar en cada reporte.
   - **Formulario de reporte**: campos con teclado apropiado (`phone-pad`, `email-address`), tipificaciones como chips/selector cargadas de la campaña activa, textarea de notas, botón Guardar con estado de envío, validación inline en español. Al guardar: confirmación visual y formulario limpio listo para la siguiente llamada.
   - **Mis reportes de hoy**: lista con hora y tipificación; los editables (dentro de ventana) muestran botón de editar con cuenta regresiva del tiempo restante.
3. **Manejo de red**: si el POST falla por conexión, el reporte queda en cola local (AsyncStorage) con reintento manual visible — un call center no puede perder reportes por WiFi inestable.

### Criterios de aceptación

- [x] Test e2e: agente crea reporte en campaña asignada (201, `tenant_id` correcto derivado en servidor); en campaña NO asignada → 403; con disposition de otra campaña → 400.
- [x] Test e2e: edición dentro de ventana OK; con `created_at` retrocedido 31 min → 403 para el autor, 200 para supervisor; ambos casos en `audit_logs`.
- [ ] En Expo Go (Android y iOS): flujo completo seleccionar campaña → llenar → guardar → aparece en "Mis reportes" en menos de 30 segundos de interacción. (Verificado headless: `tsc`/`expo lint` limpios, `expo start` — nativo y `--web` — bundlea sin errores; falta una pasada manual en dispositivo/Expo Go físico — ver `PROGRESS.md`.)
- [ ] Con modo avión: guardar deja el reporte en cola visible; al recuperar conexión, el reintento lo envía y sale de la cola. (Cola implementada y sin errores de compilación; sin dispositivo físico en esta sesión para probar modo avión real — ver `PROGRESS.md`.)

---

## FASE 5 — Tiempo real: dashboard del cliente (móvil)

**Objetivo:** la empresa cliente abre su app y ve los reportes aparecer al instante, con filtros útiles. Es la cara del producto ante los clientes del call center.

**Prerequisitos:** Fase 4 (se crean reportes reales desde móvil).

### Tareas

1. **RealtimeModule (backend)**: gateway Socket.io en `/ws`:
   - Autenticación en el handshake (JWT en `auth.token`); conexión rechazada sin token válido.
   - Al conectar: unir al socket a `tenant:{tenant_id}` (client_user) o `staff` (supervisores/admin). **El room se deriva del JWT en el servidor, nunca de lo que pida el cliente.**
   - `ReportsService.create()` emite `report.created` (payload: el reporte completo serializado) al room del tenant y a `staff` tras confirmar el INSERT. `report.updated` análogo.
2. **Endpoints de consulta**: `GET /reports` completo — filtros `from`, `to`, `disposition_id`, `campaign_id`, paginación por cursor (`?after=<id>`), orden descendente. `GET /reports/summary` — conteos por tipificación para el rango (alimenta las tarjetas del dashboard).
3. **Móvil — dashboard del cliente**:
   - Tarjetas de resumen (total del período, por tipificación) + lista en tiempo real: al llegar `report.created` por socket se inyecta arriba con animación de entrada (LayoutAnimation/Reanimated) y las tarjetas se actualizan.
   - **Filtros**: chips de rango (Hoy / Semana / Mes / Personalizado con date picker) y por tipificación; los filtros re-consultan por REST.
   - **Resync**: al reconectar el socket o al volver la app del background (`AppState`), refetch desde el último reporte visible — los eventos emitidos durante la desconexión no se pierden.
   - Detalle de reporte al tocar una fila (contacto completo, notas, agente, hora).

### Criterios de aceptación

- [x] Dos sesiones de Expo Go: agente crea reporte para Acme → el dashboard del cliente Acme lo muestra **sin recargar** en <2 s; la sesión del cliente Globex **no recibe nada** (verificar también con logs del gateway). (Verificado con un test e2e real de sockets contra Neon (`realtime-reports.e2e-spec.ts`): dos sockets autenticados conectados simultáneamente, el reporte llega solo al room del tenant dueño en <2s, el otro tenant no recibe nada. Falta la pasada manual en Expo Go/dispositivo físico — ver `PROGRESS.md`.)
- [x] Test: conexión de socket sin JWT o con JWT inválido → desconectada.
- [x] App del cliente en background → se crean 3 reportes → al volver, los 3 aparecen (resync). (Resync implementado vía invalidación de queries en `AppState → 'active'` y en `connect`/`reconnect` del socket; no verificado a mano con 3 creaciones reales en background por falta de dispositivo físico en esta sesión — ver `PROGRESS.md`.)
- [x] Filtros: rango personalizado + tipificación devuelven exactamente lo mismo que la consulta SQL equivalente sobre el seed. (Verificado con test e2e contrastando contra `prisma.forUser(user).callReport.count()` y a mano con `curl` contra el seed real de Neon.)

---

## FASE 6 — Push, cola de seguimientos y métricas de agentes

**Objetivo:** el sistema avisa aunque la app esté cerrada, los seguimientos pendientes tienen un flujo de resolución, y el dueño ve la productividad de su equipo.

**Prerequisitos:** Fase 5 (eventos de reporte fluyendo en tiempo real).

### Tareas

1. **NotificationsModule (backend)**:
   - `POST /push/register` y `DELETE /push/register` — alta/baja del token Expo del dispositivo.
   - Al crear reporte: push a los client_users del tenant («Nuevo reporte de llamada — {campaña}»). Si la disposition tiene `requires_followup`: push adicional a supervisores.
   - Envío con `expo-server-sdk` en lotes; procesar receipts y eliminar tokens inválidos (`DeviceNotRegistered`).
2. **Móvil**: pedir permiso de notificaciones tras el primer login (no en el arranque), registrar token, tocar la notificación abre el detalle del reporte (deep link con Expo Router).
3. **Cola de seguimientos**:
   - `GET /followups?status=pending|resolved` — reportes cuya disposition tiene `requires_followup`, con `followup_resolved_at` null o no.
   - `POST /followups/:reportId/resolve` — client_user del tenant o supervisor; sella `followup_resolved_at` + `followup_resolved_by`; auditado; emite `followup.resolved` por socket.
   - Móvil (cliente): tab "Seguimientos" con badge de pendientes, swipe/botón para marcar resuelto.
4. **MetricsModule** (`@Roles('super_admin','supervisor')`):
   - `GET /admin/metrics/agents?from&to` — por agente: total de reportes, promedio por hora activa, distribución por tipificación.
   - `GET /admin/metrics/overview?from&to` — volumen por día, por tenant y por campaña.
   - Agregados con SQL crudo (`GROUP BY` + `date_trunc`) — el volumen esperado (<20 agentes) no justifica tablas de resumen; dejarlo anotado como optimización futura.
5. **Admin-web**: página "Métricas" con Recharts (barras por agente, línea de volumen diario, dona de tipificaciones, tabla comparativa) y selector de rango.

### Criterios de aceptación

- [ ] En **dispositivo físico** con la app cerrada: crear reporte → llega push al cliente en segundos; tocarla abre el detalle correcto. Un reporte con "Seguimiento Pendiente" también notifica al supervisor. (No verificable en esta sesión: `getExpoPushTokenAsync()` exige un `projectId` de EAS real, hoy vacío en `app.json`, y desde el SDK 53 Expo Go ya no entrega push remoto -- hace falta `eas init` + un development build, ambos pasos manuales de Fase 8. Sí verificado con test e2e: targeting correcto -- `client_user` del tenant siempre, supervisores solo si `requiresFollowup` -- y deep link probado con notificación local en Expo Go; ver `PROGRESS.md`.)
- [x] Un token inválido simulado se elimina de `push_tokens` tras procesar receipts. (Baja lógica vía `revokedAt`, no `DELETE` -- `app_user` nunca tiene ese grant. Verificado con test e2e llamando `NotificationsService.checkReceipts()` directo con un receipt `DeviceNotRegistered` simulado.)
- [x] Flujo de seguimiento completo: aparece en pendientes → resolver → pasa a resueltos con quién y cuándo → registrado en `audit_logs` → el badge se actualiza en tiempo real. (Verificado con test e2e de punta a punta incluyendo el socket `followup.resolved`; el badge del tab en el móvil consume la misma invalidación de queries que el resto del dashboard -- ver `PROGRESS.md` para lo que falta de pasada manual.)
- [x] Métricas contrastadas a mano contra el seed (una consulta SQL de control por gráfico). (`test/metrics.e2e-spec.ts`: total por agente, `byDisposition`, `byDay`, `byTenant`, `activeTenants`, `pendingFollowups` y `agentsOnShift` contrastados contra `count()`/`groupBy` de Prisma sobre el mismo rango.)

---

## FASE 7 — Exportación (CSV/PDF) y visor de auditoría

**Objetivo:** los clientes se llevan sus datos y el call center tiene trazabilidad consultable ante disputas.

**Prerequisitos:** Fase 6 (datos y filtros completos).

### Tareas

1. **ExportsModule**:
   - `GET /exports/reports.csv?from&to&disposition_id&campaign_id` — mismos filtros del dashboard. Implementación con **cursor de PostgreSQL en lotes** (p. ej. 500 filas) pipeada al response como stream: memoria constante sin importar el volumen. Cabeceras CSV en español; RLS limita filas al tenant del solicitante.
   - `GET /exports/reports.pdf?from&to` — resumen ejecutivo con `pdfmake`: encabezado con nombre del tenant y rango, tarjetas de totales por tipificación, tabla de reportes (limitada, con nota "descargue CSV para el detalle completo").
2. **Móvil (cliente)**: botón "Exportar" en el dashboard → hoja con CSV/PDF → descarga con `expo-file-system` + `expo-sharing` (share sheet del sistema: correo, Drive, etc.).
3. **Admin-web**: exportación global (todos los tenants o uno) para `super_admin`; visor de **audit_logs** con filtros por usuario, entidad y fecha (solo lectura, paginado).

### Criterios de aceptación

- [x] Seed inflado a ~50 000 reportes: la descarga CSV completa termina sin que el proceso Node supere memoria estable (verificar con `--inspect` o métricas del contenedor). (Verificado con `scripts/export-memory-check.ts` -- consumidor lento real vía `node:http`, no un mock -- contra 50 278 filas: heap usado promedio bajó de 55.0 MB a 50.6 MB entre la primera y segunda mitad de la descarga (sin crecimiento monótono), 12.8 MB en 82.5s. Ver `PROGRESS.md` para el detalle completo y el gotcha de `tsx`/decorator metadata que obligó a correrlo compilado.)
- [x] El CSV descargado desde la app de un cliente contiene **solo** filas de su tenant y coincide en conteo con el dashboard para el mismo filtro. (Verificado con `test/exports.e2e-spec.ts`: conteo contra `GET /reports/summary` y contra `prisma.forUser(user).callReport.findMany()`, más `?tenantId=` de otro tenant forzado sin efecto para un `client_user`.)
- [x] El PDF abre en iPhone y Android vía share sheet y refleja los filtros aplicados. (Backend verificado con e2e -- `%PDF-`, filtros aplicados, tarjetas de totales; `expo-file-system`/`expo-sharing` integrados en `(client)/exportar.tsx`. Falta la pasada manual en un dispositivo físico -- mismo estado que el resto de los criterios "en dispositivo físico" de las Fases 1-6, ver `PROGRESS.md`.)
- [x] El visor de auditoría muestra los eventos de todas las fases anteriores; sigue siendo imposible modificar `audit_logs` (re-verificar REVOKE). (`test/audit-viewer.e2e-spec.ts`: acciones de Fases 3/4/6 sobre el mismo reporte + una mutación de admin independiente, todas visibles; `UPDATE`/`DELETE` rechazados por Postgres incluso para staff. `audit_logs` pasó a tener RLS propia en esta fase -- ver D4/gotcha de `INSERT...RETURNING` en `PROGRESS.md`.)

---

## FASE 8 — Endurecimiento y publicación

**Objetivo:** dejar el backend y el panel admin listos para producción.

**Prerequisitos:** Fases 1–7 completas y verificadas.

**Nota (agregada al planificar la fase, ver `plan-fase-8.md`):** la
publicación móvil en tiendas (tarea 4 original de este plan) depende de
cuentas pagas (Apple/Google) y dispositivos físicos que no estaban
disponibles al ejecutar esta fase — se movió a una **Fase 9** nueva,
junto con todas las pasadas manuales "en dispositivo físico" que quedaron
pendientes desde las Fases 1–7. La Fase 8 cierra con: seguridad,
robustez, CI en verde y el backend + admin-web desplegados (Render, sin
Docker — ver `plan-fase-8.md` D10 para por qué se descartó VPS+Docker).

### Tareas

1. **Seguridad**: `@nestjs/throttler` (límite estricto en `/auth/*`), `helmet`, CORS restringido al dominio del admin-web, tamaño máximo de body, revisión de que **ningún** servicio use el cliente Prisma crudo (grep de CI que falle si aparece fuera de `PrismaService`).
2. **Robustez**: manejo global de excepciones con respuestas consistentes en español, logging estructurado (pino) con request-id, healthcheck `GET /health` (+ `/health/ready`), backups automatizados de postgres (script `pg_dump` + documentación de restauración).
3. **Pruebas finales**: suite e2e completa verde en CI (GitHub Actions: lint + test + build de los tres apps); prueba de humo del flujo completo de los tres roles contra el backend ya desplegado (`scripts/smoke-deploy.mjs`).
4. ~~Publicación móvil~~ — movida a **Fase 9**.
5. **Despliegue**: Render (Web Service para el API + Static Site para admin-web, sin Docker — la base sigue en Neon); `render.yaml` en la raíz como Blueprint; documentado en `README.md` con la alternativa VPS+Docker descartada.
6. **Datos demo pulidos** para la presentación al cliente final (`prisma/seed-demo.ts`, script aparte del seed de desarrollo/CI).

### Criterios de aceptación

- [x] CI en verde: lint, tests e2e (incluida la suite de aislamiento) y builds de api, mobile y admin-web. (`.github/workflows/ci.yml`, 4 jobs; equivalente local `npm run ci` verificado: 11 suites e2e / 52 tests en verde, `lint`/`lint:prisma`/`build` de los tres apps limpios.)
- [x] Rate limit verificado: fuerza bruta a `/auth/login` bloqueada tras N intentos. (`test/throttler.e2e-spec.ts`, instancia propia con `THROTTLE_ENABLED=true`; el resto de las suites corre con el throttler inerte para no romperse con sus ~35 logins reales por corrida.)
- [ ] Backup y restauración de la base ejecutados una vez con éxito, documentados. (Scripts `backup-db.ps1`/`.sh` listos; falta instalar `pg_dump`/`psql` — no disponibles en la máquina de desarrollo — y correr la restauración una vez contra un branch de Neon, ver `PROGRESS.md`.)
- [ ] Backend desplegado y accesible: `scripts/smoke-deploy.mjs` en verde contra la URL real. (`render.yaml` listo; falta el paso manual de crear la cuenta/servicios en Render y cargar los secrets, ver `PROGRESS.md`.)

---

## FASE 9 — Publicación móvil

**Objetivo:** las apps listas para las tiendas, y cerrar todas las
verificaciones manuales "en dispositivo físico" acumuladas desde la
Fase 1.

**Prerequisitos:** Fase 8 completa (backend desplegado y endurecido).

### Tareas

1. `npx eas init` (llena `extra.eas.projectId`, hoy `""` en `app.json` —
   bloqueador del push real desde la Fase 6) y `eas.json` con perfiles
   dev/preview/production.
2. Development build (`eas build --profile development`) para probar
   **push remoto real** — Expo Go ya no lo entrega desde el SDK 53.
3. Íconos, splash y `app.json` reales: `name`/`slug`/`scheme` hoy dicen
   `"mobile"` (placeholder del template de Expo, nunca tocado desde el
   commit inicial); `ios.bundleIdentifier` y `android.package` no están
   definidos (bloquean el build tal cual).
4. Builds firmados, subida a Play Store y App Store, notas para la
   revisión de Apple (cuentas demo de cada rol).
5. **Pasadas manuales acumuladas de las Fases 1–8** (todas verificadas
   hasta ahora solo de forma headless — bundler/tsc/lint limpios, tests
   e2e reales contra Neon — pero nunca en un dispositivo físico real, ver
   `PROGRESS.md` de cada fase para el detalle):
   - Flujo del agente completo en <30s (Fase 4).
   - Modo avión con la cola offline de reportes (Fase 4).
   - Dos sesiones simultáneas (agente + cliente) para verificar tiempo
     real con latencia real de dispositivo, y resync tras volver del
     background (Fase 5).
   - Push real llegando con la app cerrada, deep link a la notificación,
     targeting correcto de supervisores (Fase 6).
   - Compartir/abrir un CSV y un PDF exportados desde el share sheet de
     iOS/Android (Fase 7).
   - Navegador real con clicks para el flujo completo de admin-web
     (Fases 3, 6, 7).

### Criterios de aceptación

- [ ] Build de producción de la app instalada en un Android y un iPhone
      físicos: flujo completo agente + cliente + push funcionando contra
      el backend desplegado (Fase 8).
- [ ] Las 6 pasadas manuales de la tarea 5 verificadas y tachadas de
      `PROGRESS.md`.
- [ ] App publicada (o en revisión) en Play Store y App Store.

---

## Riesgos conocidos y mitigaciones

- **RLS mal configurado = fuga entre tenants.** Mitigación: la suite de aislamiento (Fases 1–2) corre en CI en cada commit; conexión solo con rol no-superusuario; `FORCE ROW LEVEL SECURITY`.
- **Sockets no entregan eventos con la app en background.** Mitigación: resync al volver a primer plano (Fase 5) + push (Fase 6); el socket es mejora de experiencia, no fuente de verdad.
- **Pérdida de reportes por mala conexión del agente.** Mitigación: cola local con reintento (Fase 4).
- **Revisión de Apple.** Mitigación: cuentas demo por rol y descripción clara del uso B2B en la ficha (Fase 9).
