# callreport-platform

Plataforma multi-tenant para call center: los agentes registran reportes de
llamada desde una app móvil, las empresas cliente los ven aparecer en
tiempo real en la misma app, y el dueño del call center administra todo
desde un panel web. Ver `plan.md` para el plan de desarrollo completo por
fases y `PROGRESS.md` para el estado real de avance.

## Arquitectura en 10 líneas

- **Backend** (`apps/api`): NestJS + Prisma + PostgreSQL (Neon) + Socket.io.
  Multi-tenancy con **Row-Level Security real** en Postgres, no a nivel de
  aplicación — cada query corre con `set_config('app.tenant_id', ...)`
  fijado en una transacción (`PrismaService.forUser()`).
- **App móvil** (`apps/mobile`): Expo + React Native. Un único bundle sirve
  tanto a agentes (registran reportes) como a empresas cliente (dashboard
  en tiempo real vía sockets + push).
- **Panel admin** (`apps/admin-web`): React + Vite. CRUD de tenants/
  usuarios/campañas, métricas, exportación, visor de auditoría.
- **Base de datos**: Neon (Postgres administrado, serverless) — sin
  Docker ni instancia local. Endpoint **directo** (rol `migrator`, dueño
  del schema) para migraciones; endpoint **pooled** (rol `app_user`,
  sujeto a RLS) para runtime.
- **Monorepo** con npm workspaces (`apps/*`, `packages/*`), sin Docker.

## Setup local

Prerequisitos: Node 22, un proyecto Neon, Git.

```bash
npm ci
cp apps/api/.env.example apps/api/.env      # completar con tu Neon
cp apps/admin-web/.env.example apps/admin-web/.env
# apps/mobile no necesita .env para desarrollo normal (ver más abajo)

# Una sola vez, contra un proyecto/branch de Neon nuevo:
#   correr apps/api/prisma/init/01-roles.sql a mano (psql o el SQL editor
#   de Neon) -- crea los roles `migrator` y `app_user`.

cd apps/api
npx prisma migrate deploy
npm run db:seed
cd ../..

npm run dev:api        # http://localhost:3000
npm run dev:admin-web  # http://localhost:5173
npm run dev:mobile     # expo start
```

Usuarios de seed (contraseña `Password123!` para todos):
`admin@callreport.demo` (super_admin), `supervisor@callreport.demo`,
`agent1@callreport.demo`..`agent3`, `client1@acmecorp.demo`,
`client1@globex.demo`.

## Variables de entorno

### `apps/api/.env` (ver `.env.example`, comentado variable por variable)

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Neon, endpoint **directo**, rol `migrator`. Solo migraciones/seed. |
| `APP_DATABASE_URL` | Neon, endpoint **pooled** (`-pooler`), rol `app_user`. Runtime. |
| `PORT` | Puerto HTTP (Render lo inyecta solo, no hace falta declararlo ahí). |
| `JWT_ACCESS_SECRET` | Firma de access tokens. |
| `EXPO_ACCESS_TOKEN` | Opcional, solo si la cuenta de Expo tiene "enhanced security". |
| `PUSH_ENABLED` | `false` apaga el envío real de push sin tocar código. |
| `METRICS_TZ` | IANA tz name para `date_trunc` por día en métricas. |
| `NODE_ENV` | `development`\|`test`\|`production`. Controla logging y si `CORS_ORIGINS` es obligatoria. |
| `CORS_ORIGINS` | CSV de orígenes permitidos (HTTP + gateway de sockets). Obligatoria en producción. |
| `THROTTLE_ENABLED` / `THROTTLE_AUTH_LIMIT` / `THROTTLE_AUTH_TTL` / `THROTTLE_GLOBAL_LIMIT` / `THROTTLE_GLOBAL_TTL` | Rate limiting (Fase 8). |
| `LOG_LEVEL` | Nivel de pino. Ignorado en test (silent forzado). |

### `apps/admin-web/.env`

| Variable | Qué es |
|---|---|
| `VITE_API_BASE_URL` | URL del API. **Se hornea en build time** — cambiarla implica rebuildear, no solo reiniciar. |

### `apps/mobile` (`.env.example`, opcional en desarrollo)

| Variable | Qué es |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL del API. En desarrollo normal se deja sin setear (se deriva de la IP del bundler); **obligatoria** para builds de producción (Fase 9, EAS Build) — sin bundler no hay heurística posible. |

## Migraciones

Siempre con `DATABASE_URL` (endpoint **directo**, rol `migrator`) —
**nunca** con el pooled: `prisma migrate deploy` usa advisory locks y DDL
que no son confiables a través de PgBouncer en modo transacción.

```bash
cd apps/api
npx prisma migrate deploy
```

En producción, este comando corre como paso de release antes de que el
nuevo código del API empiece a recibir tráfico (ver "Despliegue" abajo).

## Despliegue

**Elegido: Render, sin Docker.** La base ya vive en Neon, así que un
contenedor solo aportaría empaquetado — nada de lo que Docker resuelve
bien (paridad de entorno con una DB local) aplica acá. `render.yaml` en
la raíz define los dos servicios como Blueprint:

| Servicio | Tipo | Build | Start |
|---|---|---|---|
| `callreport-api` | Web Service (Node) | `npm ci && npm run build --workspace apps/api` | `npm run start:prod --workspace apps/api` |
| `callreport-admin` | Static Site | `npm ci && npm run build --workspace apps/admin-web` | sirve `apps/admin-web/dist` |

### Pasos para desplegar

1. En el dashboard de Render: **New > Blueprint**, apuntar al repo. Render
   lee `render.yaml` y arma los dos servicios.
2. Completar los secrets que `render.yaml` deja en blanco (`sync: false`):
   `DATABASE_URL` y `APP_DATABASE_URL` del branch de Neon de
   **producción** (`JWT_ACCESS_SECRET` se genera solo).
3. Elegir plan **pago** (no free tier) para `callreport-api` — el free
   tier duerme el servicio por inactividad, lo que mata todos los sockets
   de Socket.io abiertos y retrasa el push.
4. Correr las migraciones una vez contra la base de producción antes del
   primer deploy real (`DATABASE_URL=<producción> npx prisma migrate
   deploy` desde tu máquina, o como release command en Render).
5. Si Render no pudo asignarle a `callreport-admin`/`callreport-api`
   exactamente esos subdominios (ya estaban tomados), actualizar a mano
   `CORS_ORIGINS` (en `callreport-api`) y `VITE_API_BASE_URL` (en
   `callreport-admin`, requiere rebuild) con los dominios reales.
6. Verificar el deploy: `SMOKE_BASE_URL=<url-del-api> node
   apps/api/scripts/smoke-deploy.mjs` — login de los 3 roles + `/health/ready`.

### Por qué no VPS + Docker

Se consideró (era la opción por defecto antes de la Fase 8) pero se
descartó: para menos de 20 agentes, mantener nginx + TLS + Docker Compose
a mano es más trabajo operativo que un PaaS administrado, sin ninguna
ventaja real (la base ya está fuera del VPS, en Neon). Queda como
alternativa documentada si el volumen creciera lo suficiente como para
justificar el control fino de infraestructura.

### Límites conocidos del despliegue actual

- **Una sola instancia.** Socket.io con más de una instancia necesita
  sticky sessions + un adapter de Redis; el rate limiting (en memoria del
  proceso) también se multiplicaría por instancia. A menos de 20 agentes,
  una instancia alcanza de sobra.
- **`VITE_API_BASE_URL` se hornea en build time**, no en runtime —
  cambiar el dominio del API implica rebuildear `admin-web`, no solo
  reiniciarlo.
- El push real (Fase 6) sigue apagado (`PUSH_ENABLED=false`) hasta la
  Fase 9 (`eas init` + development build).

## Backups y restauración

**Primera línea: Neon point-in-time recovery.** Cubre el 95% de los
escenarios reales (borrado accidental, una migración salió mal):
restaurar es crear un branch de Neon en un timestamp anterior, en
segundos, desde el dashboard de Neon — sin ningún script de por medio.

**Respaldo externo: `pg_dump`.** Cubre el escenario que PITR no cubre:
perder el acceso a la cuenta de Neon.

```bash
# Requiere client tools de PostgreSQL instaladas (pg_dump >= versión del
# server de Neon, o falla con "server version mismatch" -- confirmar la
# versión del server antes de instalar).
cd apps/api
./scripts/backup-db.sh          # o .\scripts\backup-db.ps1 en Windows
```

Genera un `.dump` con timestamp en `apps/api/backups/` (gitignoreado).
Para restaurar contra un branch de Neon (verificado una vez: dump →
branch vacío → `pg_restore` → las 11 suites e2e pasan contra la copia):

```bash
pg_restore --no-owner --no-privileges -d <connection-string-del-branch> apps/api/backups/callreport-<timestamp>.dump
```

## CI

`.github/workflows/ci.yml`, 4 jobs: `lint`, `build`, `prisma-usage` (grep
de que nadie use el cliente Prisma crudo fuera de `PrismaService`) y `e2e`
(la única que toca la red). Equivalente local, sin necesidad de pushear:

```bash
npm run ci
```

### Configurar el CI en GitHub

1. Crear un **branch de Neon dedicado a CI**, a partir del de desarrollo
   (copia copy-on-write: hereda schema, roles, GRANTs, políticas RLS y
   datos del seed). Verificar que `app_user`/`migrator` conserven sus
   GRANTs en el branch nuevo — si no, correr
   `apps/api/prisma/init/01-roles.sql` a mano ahí.
2. Cargar 3 secrets en GitHub → Settings → Secrets → Actions, apuntando a
   ese branch de CI (no al de desarrollo ni al de producción):
   `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_ACCESS_SECRET`.
3. Las suites crean entidades con sufijo `randomUUID()`, así que corridas
   repetidas no colisionan — solo acumulan filas. Recrear el branch de CI
   desde el de desarrollo cada tanto es un click en el dashboard de Neon,
   no una migración.

## Datos demo

`prisma/seed.ts` es el seed de desarrollo/CI (no tocar: las 11 suites e2e
dependen de sus emails/contraseña exactos). Para una demo con datos más
realistas (empresas con nombres reales, distribución no uniforme,
reportes concentrados en los últimos 14 días, seguimientos vencidos y al
día, citas futuras):

```bash
cd apps/api
DATABASE_URL="<branch de DEMO de Neon, nunca desarrollo ni CI>" npm run seed:demo -- --confirm
```

`--confirm` es obligatorio a propósito (el script borra todos los datos
existentes antes de poblar).

## Seguridad

- Row-Level Security real en Postgres (no aplicativo) para todo lo
  multi-tenant, con `FORCE ROW LEVEL SECURITY` y el rol de runtime
  (`app_user`) sin `BYPASSRLS`.
- Rate limiting en `/auth/*` (`@nestjs/throttler`), `helmet`, CORS
  restringido por entorno, tamaño máximo de body.
- `apps/api/scripts/check-prisma-usage.mjs` (`npm run lint:prisma`,
  también en CI): falla si aparece el cliente Prisma crudo fuera de las
  excepciones documentadas y versionadas en el propio script.
- `audit_logs` es inmutable: el rol de runtime no tiene `GRANT
  UPDATE/DELETE` sobre esa tabla, verificado con tests e2e.
