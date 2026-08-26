# Bitácora de progreso

Registro de qué fase de `plan.md` está completa, qué falta y notas operativas para la próxima sesión/fase. Ver `CLAUDE.md` para la convención de cuándo actualizar este archivo.

---

## FASE 1 — Fundación: monorepo, base de datos, RLS y seeds

**Estado: completa** (2026-08-23)

### Qué se hizo

- Monorepo (`apps/*`, `packages/shared`) y `packages/shared` con tipos base.
- Base de datos en **Neon** (Postgres administrado) — no local, no Docker. Roles `migrator` (BYPASSRLS, dueño del schema) y `app_user` (ordinario, sujeto a RLS) creados a mano vía `apps/api/prisma/init/01-roles.sql`.
- Schema Prisma completo (`Tenant`, `User`, `TenantMembership`, `Campaign`, `CampaignAgent`, `Disposition`, `CallReport`, `AuditLog`, `PushToken`, más `Shift` agregado después de la Fase 1 original).
- 4 migraciones aplicadas contra Neon (`init`, `enable_rls`, `shifts_and_disposition_kinds`, `shifts_rls`), incluida la corrección de un bug donde las políticas RLS casteaban `current_setting(...)::uuid` contra columnas que en realidad son `TEXT`.
- Seed corrido y verificado: 2 tenants, 9 usuarios, 4 campañas, 76 turnos, 189 `call_reports`.
- **Aislamiento RLS verificado a mano con `psql` como `app_user`**: sin `app.tenant_id`/`app.role` seteados → 0 filas; seteado a Acme → solo Acme; a Globex → solo Globex; `UPDATE`/`DELETE` en `audit_logs` → `permission denied`.
- Scaffold móvil (`apps/mobile`, Expo Router, `src/app` como root): rutas placeholder `(auth)/login`, `(agent)/home`, `(client)/dashboard`, redirect inicial a `/login`. `tsc --noEmit` limpio; `expo start` (nativo y `--web`) levanta sin crashear y sirve el bundle real (HTTP 200, ~4 MB) sin errores de Metro.
- **Bug de instalación corregido**: `expo start` crasheaba siempre (`Cannot find module 'expo-router/_ctx-shared'`) por un hoisting inconsistente de npm workspaces — `@expo/cli`/`@expo/router-server` quedaban en el `node_modules` raíz pero `expo-router` solo estaba anidado en `apps/mobile/node_modules`, y ese paquete lo resuelve como si fuera hermano de `@expo/router-server`. Se agregó `expo-router` como dependencia también en el `package.json` raíz para forzar que npm lo instale ahí también.
- Se eliminó Docker del repo (`docker-compose.yml`, `apps/api/Dockerfile`) — no se usa por ahora; puede reevaluarse en Fase 8 solo para desplegar `api`/`admin-web` (la base de datos ya no depende de eso, sigue en Neon).

### Qué queda pendiente / deferido

- No se probó en un dispositivo físico ni en la app Expo Go real (solo se verificó que el servidor levanta y sirve el bundle, sin crashear, en modo headless) — recomendable una pasada manual en dispositivo antes de confiar del todo en el criterio "abre en Expo Go".
- `apps/api/src` sigue siendo el scaffold default de NestJS (`app.controller/module/service`) — no tiene `PrismaService`, auth, ni ningún módulo de negocio todavía. Eso es trabajo de Fase 2, no un pendiente de Fase 1.
- `apps/admin-web` ya tiene bastante UI construida (varias páginas de admin y de mobile-preview) pero corre sobre datos mockeados (`src/mocks/seed.ts`), no contra el API real — quedará conectado cuando Fase 3 lo requiera.

### Notas operativas

- La base es Neon: `DATABASE_URL` (endpoint directo, rol `migrator`) para migraciones/seed; `APP_DATABASE_URL` (endpoint `-pooler`, rol `app_user`, `pgbouncer=true`) para runtime. Ver `apps/api/.env.example` para el formato.
- `apps/api/prisma/init/01-roles.sql` no corre automático (no hay contenedor Docker); si se crea un proyecto/branch de Neon nuevo hay que correrlo a mano ahí primero.
- Si en el futuro `expo start` vuelve a fallar con un `MODULE_NOT_FOUND` de algún paquete de `@expo/*`, sospechar primero de hoisting roto en `node_modules` (ver el bug de arriba) antes de asumir que es un problema del código de la app.

---

## FASE 2 — Autenticación y aislamiento en el API

**Estado: completa** (2026-08-23)

### Qué se hizo

- `AuthModule` (`apps/api/src/auth/`): `POST /auth/login`, `/auth/refresh`, `/auth/logout`. Access token JWT (15 min, HS256) + refresh token opaco "selector.validador" (id de fila + secreto aleatorio hasheado con argon2 en la tabla `refresh_tokens` nueva), con rotación en cada uso y **detección de reuso**: un refresh ya rotado que se reintenta revoca toda la familia de tokens del usuario.
- `JwtAuthGuard` (global vía `APP_GUARD`, bypass con `@Public()`) + `RolesGuard` (global, lee `@Roles(...)`) + decoradores `@CurrentUser()`/`@CurrentTenant()`.
- `PrismaService.forUser(user)` (`apps/api/src/prisma/`): cliente de Prisma extendido (`$extends` + `$allOperations`) donde cada operación de modelo corre dentro de su propia transacción que primero fija `app.user_id`/`app.role`/`app.tenant_id` vía `set_config(..., true)` — el contrato de sesión que ya esperaban las políticas RLS de la Fase 1. Regla de código: los servicios de negocio solo acceden a la DB a través de este método; `AuthService` es la única excepción documentada (corre antes de que exista un usuario autenticado).
- `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted` + `transform`) en `main.ts`.
- `GET /reports` (`ReportsModule`) como endpoint de humo vía `forUser()`, y `GET /admin/ping` (`AdminModule`, placeholder que reemplaza la Fase 3) protegido con `@Roles(super_admin, supervisor)` para poder probar el 403 de `RolesGuard`.
- Suite `apps/api/test/isolation.e2e-spec.ts` (7 tests, corre contra el seed real de Neon): aislamiento por tenant incluso forzando `?tenantId=` en la query, 401 sin token, 403 por rol, reuso de refresh token, y 400 por campo no declarado en el DTO.
- Login funcional en móvil: pantalla real en `(auth)/login.tsx`, sesión persistida con `expo-secure-store` (`src/lib/session.ts`), `AuthProvider`/`useAuth()` (`src/lib/auth-context.tsx`) con `authFetch()` que reintenta una vez tras un 401 refrescando el access token, redirección por rol desde `index.tsx` (`homeRouteForRole`), y botón "Cerrar sesión" en las pantallas placeholder de agente/cliente (necesario para poder probar ambos roles sin reinstalar la app).

### Qué quedó pendiente / deferido

- **No probado en Expo Go real ni en dispositivo físico** — mismo nivel de verificación que la Fase 1 (bundler headless sin errores, `tsc`/`expo lint` limpios). Falta una pasada manual: login como agente y como cliente, y confirmar que matar/reabrir la app mantiene la sesión.
- `apps/mobile` no importa tipos desde `@callreport/shared` todavía (`Role`, etc.) — se duplicó un tipo `Role` local en `src/lib/session.ts`, mismo criterio que ya usaba `apps/api/prisma/seed.ts` con `DEFAULT_DISPOSITIONS`. Cablear el import cross-workspace real (Metro necesita config adicional para paquetes del monorepo sin build propio) queda para cuando de verdad haga falta compartir más tipos con el móvil.
- `GET /admin/ping` es un placeholder solo para probar `RolesGuard`; el CRUD real de administración (tenants/usuarios/campañas) es tarea de la Fase 3, bajo el mismo prefijo `/admin`.
- El endpoint `GET /reports` es mínimo (paginación `take`/`skip` simple, sin filtros ni cursor) — la versión completa con filtros y cursor llega en la Fase 5.
- Rate limiting de `/auth/login` (fuerza bruta) es explícitamente Fase 8, no Fase 2.

### Notas operativas / bugs corregidos en el camino

- **Bug de Prisma v7 + CJS**: el generador `prisma-client` produce cliente ESM por defecto; `apps/api` es CommonJS (sin `"type": "module"`), y nada bajo `src/` había importado el cliente generado hasta esta fase, así que el problema nunca se había manifestado. `nest start` crasheaba con `ReferenceError: exports is not defined`. Fix: `moduleFormat = "cjs"` en el bloque `generator client` de `schema.prisma` + `npx prisma generate`.
- **Bug de RLS pre-existente para login de `client_user`**: la política `tenant_memberships_client_select` (Fase 1) exige `tenant_id = app.tenant_id`, pero resolver el tenant en login es precisamente el paso en el que `tenant_id` **todavía no se conoce**. Se agregó la migración `tenant_membership_self_select` con una política adicional (permissive, se combina por OR) que permite a cualquier sesión ver sus propias filas de `tenant_memberships` por `user_id`, sin depender de rol ni tenant.
- **`ts-jest` + Prisma v7 generado**: dos problemas de tooling nuevos, ambos con fix ya aplicado en `apps/api`:
  - Los imports con extensión `.js` que emite el generador de Prisma (aun en modo CJS) no resuelven bajo `ts-jest`/NodeNext sin `moduleNameMapper` — se agregó `{"^(\\.{1,2}/.*)\\.js$": "$1"}` tanto en `test/jest-e2e.json` como en el bloque `jest` de `package.json`.
  - El motor de queries "client" (WASM) de Prisma 7.9 usa `import()` dinámico, que Jest bloquea por defecto (`--experimental-vm-modules`). Se agregó `cross-env` como dependencia y el script `test:e2e` ahora corre con `NODE_OPTIONS=--experimental-vm-modules`.
- Contraseña de todos los usuarios del seed (Fase 1): `Password123!`.
- `JWT_ACCESS_SECRET` ya está en `apps/api/.env` (generado local, no commiteado); `apps/api/.env.example` documenta cómo regenerarlo.

---

## FASE 3 — Panel web de administración (CRUD)

**Estado: completa** (2026-08-26)

### Qué se hizo

- **Backend**: `TenantsModule`, `UsersModule`, `CampaignsModule` (`apps/api/src/{tenants,users,campaigns}`) con CRUD real bajo `/admin/*`, todos vía `PrismaService.forUser()`. Creación/borrado de tenants y usuarios restringido a `super_admin` (`@Roles` de método pisa al de clase); campañas/tipificaciones/asignación de agentes también editables por `supervisor`, como pide `plan.md`.
- **AuditModule** (`apps/api/src/audit/`): `@AuditEntity('X')` + `AuditInterceptor` global escribe en `audit_logs` (usuario, acción, entityId, diff superficial del body, IP) tras cada mutación exitosa, esperando el insert antes de responder (no hace falta un endpoint de lectura de auditoría para Fase 3 — eso es Fase 7).
- **`campaign_agents` ahora tiene `is_active`** (migración `campaign_agents_soft_remove`): desasignar un agente es un `UPDATE`, no un `DELETE` — ver "Notas operativas" abajo, es la misma razón por la que no hay endpoint de borrado de tipificaciones (`DELETE /admin/campaigns/:id/dispositions/:id`), solo `PATCH { isActive: false }`.
- `apps/api/src/campaigns/default-dispositions.ts` consolida el set de 8 tipificaciones por defecto (antes duplicado inline en `prisma/seed.ts`); lo usan tanto `CampaignsService.create()` como el seed.
- **Frontend**: nueva capa `apps/admin-web/src/api/` (sesión real en `localStorage`, `authFetch` con reintento-en-401, hooks TanStack Query) — mismo patrón que `apps/mobile/src/lib/`. `AdminLoginPage` + `AdminAuthGate` protegen `/admin/*`; `ClientesPage`, `UsuariosPage`, `CampanasPage`, `CampanaDetallePage` dejan de usar el `AppStore` mock y hablan con el API real.
- `test/admin-crud.e2e-spec.ts` (nuevo): flujo completo tenant → campaña (8 dispositions) → editar 3 → 2 agentes → asignación → client_user, cada mutación verificada en `audit_logs`, y 403 de supervisor creando tenant. `test/isolation.e2e-spec.ts` actualizado (`/admin/ping` ya no existe, ahora prueba con `/admin/tenants`).

### Qué quedó pendiente / deferido

- `MetricasPage`, `TurnosPage`, `AuditoriaPage` y todo `/mobile/*` (prototipos Stitch AI) siguen sobre el `AppStore` mock — están fuera de alcance de Fase 3 (Métricas es Fase 6, el visor de auditoría real es Fase 7; los mocks de `/mobile/*` son referencia de diseño para la app Expo real, no producción).
- CORS del API abierto (`app.enableCors()` sin restricción de origen) — Fase 8 tiene la tarea explícita de restringirlo al dominio real de `admin-web`.
- No se probó a mano en un navegador real con clicks (sin GUI disponible en esta sesión): se verificó en su lugar (a) la suite e2e completa contra Neon, (b) `tsc -b` + `vite build` limpios en `admin-web`, y (c) el flujo real login → `GET /admin/tenants` vía `curl` con el `Origin` del dev server de Vite, confirmando CORS y auth de punta a punta. Recomendable una pasada manual en Chrome/Firefox antes de dar Fase 3 por verificada al 100%.
- `ClientesPage` perdió la columna "Reportes este mes" (dependía del mock de `CallReport`; no hay endpoint agregado de reportes por tenant todavía — llega con Fase 5/6).

### Notas operativas

- **`app_user` nunca tiene `GRANT DELETE`** en ninguna tabla (ver `prisma/init/01-roles.sql`: "la aplicación nunca borra filas físicamente, usa flags de estado en su lugar") — esto rompió el diseño inicial de `PUT /admin/campaigns/:id/agents` (usaba `deleteMany`) y de un endpoint `DELETE` de tipificaciones que se había planeado. Ambos se rediseñaron sin ningún `DELETE`/`.delete()`/`.deleteMany()`: asignar agentes es upsert + `updateMany({isActive:false})`, "borrar" una tipificación es `PATCH {isActive:false}`. Si una fase futura necesita un hard-delete real de algo, hay que revisar primero si `01-roles.sql` debe cambiar (impacto amplio, pensarlo dos veces).
- `forUser()` corre cada operación en su propia transacción (no se puede meter un create de dos modelos relacionados en un único `$transaction` sin saltarse el contexto RLS) — por eso `UsersService.create()` y `CampaignsService.create()` **validan la existencia del tenant ANTES** de crear la fila principal, en vez de crear-y-compensar-con-delete-si-falla (que tampoco sería posible sin `GRANT DELETE`).
- Contraseña inicial de usuarios creados desde `UsuariosPage` la define quien los crea (campo nuevo en el formulario) — no hay generación automática ni email de bienvenida (fuera de alcance).
- Sesión de `admin-web` en `localStorage` (`callreport.admin.session`), separada de la sesión mock de `AppStore`/`RoleSwitcher`.
