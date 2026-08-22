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

**Estado: no iniciada**
