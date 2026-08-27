# Plan de implementación — FASE 8

> Endurecimiento y publicación del backend.
> Detalle de ejecución de la Fase 8 de `plan.md`. El plan maestro define el **qué**;
> este archivo define el **cómo**, los bloqueadores encontrados al revisar el código
> ya escrito (Fases 1–7) y las decisiones tomadas antes de empezar.
> Al terminar, la bitácora va a `PROGRESS.md` (ver `CLAUDE.md`).

**Alcance acordado al planificar:** la publicación en tiendas (EAS Build, firmas,
App Store / Play Store) **sale de la Fase 8 y pasa a una Fase 9 nueva** — ver §6.
La Fase 8 cierra con: seguridad, robustez, CI en verde y el backend desplegado.

---

## 0. Estado de partida (lo que ya existe y condiciona la fase)

| Pieza | Estado | Implicancia para Fase 8 |
|---|---|---|
| `main.ts` | `enableCors({ exposedHeaders: ['Content-Disposition'] })`, sin origen restringido | Restringir sin perder `exposedHeaders` (D2) |
| `RealtimeGateway` | `@WebSocketGateway({ path: '/ws', cors: { origin: true } })` — CORS propio, independiente de `main.ts` | Segundo punto a restringir; el decorador se evalúa antes que `ConfigModule` (D2) |
| Guards globales | `APP_GUARD`: `JwtAuthGuard` → `RolesGuard` (en `AuthModule`) | El `ThrottlerGuard` se suma a esa cadena; el orden importa (D1) |
| `@nestjs/throttler`, `helmet`, `pino` | **Ninguno instalado** | 4 dependencias nuevas en `apps/api` |
| `apps/api/test/*.e2e-spec.ts` | 10 suites, ~35 `POST /auth/login` por corrida, misma IP, en serie | Un rate limit estricto **rompe la propia suite** (D1, bloqueador real) |
| `AuthService` | Único consumidor legítimo del cliente Prisma crudo (`this.prisma.user.findUnique`, 2 usos documentados) | El grep de CI necesita allowlist, no puede ser un `grep -q` a secas (D4) |
| `PrismaService` | `forUser()` / `forSystem()` / `forUserRaw()` | El grep debe cubrir los tres, no solo `forUser()` (nota de Fase 6) |
| `ExportsController` | Usa `@Res()` de Express y streamea con headers ya enviados | El filtro global de excepciones **no puede** intentar responder ahí (D5) |
| `AppController` | `GET /` → `'Hello World!'` (scaffold de Nest), `app.e2e-spec.ts` lo verifica | Se reemplaza por `/health` + `/health/ready` (D7) |
| `AuditInterceptor` | Ya lee IP de `X-Forwarded-For` | Coherente con el `trust proxy` que necesita el throttler (D1) |
| Base de datos | Neon; `DATABASE_URL` (directo, `migrator`) + `APP_DATABASE_URL` (pooled, `app_user`) | El CI necesita **su propio branch** de Neon (D9) |
| `pg_dump` / `psql` | **No instalados** en la máquina de desarrollo (por eso Fases 4/6/7 verificaron RLS con scripts Node/`pg`) | Prerequisito manual para el criterio de backup (D8) |
| `git remote` | **No hay remoto configurado** | Hay que crear el repo en GitHub antes de que el CI pueda correr (§5) |
| `.github/` | No existe | Workflow nuevo desde cero (D9) |
| `README.md` | **No existe** en la raíz | `plan.md` tarea 5 exige documentar despliegue + variables + migraciones ahí |
| `apps/mobile/src/lib/api-config.ts` | Deriva la URL del API de `Constants.expoConfig.hostUri` (IP del bundler) | Sin bundler no hay host: hace falta `EXPO_PUBLIC_API_URL` (D11) |
| `apps/admin-web/src/api/config.ts` | `VITE_API_BASE_URL` con fallback a `localhost:3000` | Ya está listo para el build de producción, solo hay que setear la variable |
| Seed | 2 tenants demo, `Password123!` para todos, ~189 reportes | Base del CI **y** de los datos demo (D12) |
| Scripts de calidad | `lint`/`build`/`test:e2e` por workspace; **nada en la raíz** | Falta un `npm run ci` que los orqueste (D9) |

---

## 1. Decisiones y bloqueadores (resolver antes de escribir código)

### D1 — Throttler: el rate limit estricto rompe la suite e2e

**El bloqueador.** `plan.md` pide "límite estricto en `/auth/*`". Las 10 suites e2e
hacen ~35 logins reales contra el API, desde la misma IP, en menos de dos minutos
(corren con `--runInBand`). Cualquier límite razonable para fuerza bruta (5–10 por
minuto) **hace fallar la propia suite** que el criterio 1 exige ver en verde. No es
un detalle de implementación: es una contradicción entre dos criterios de la misma
fase.

**Decisión:** los límites se leen de `.env` y el CI los relaja explícitamente.

```
THROTTLE_ENABLED=true          # false ⇒ ThrottlerGuard registrado pero inerte
THROTTLE_AUTH_LIMIT=10         # intentos
THROTTLE_AUTH_TTL=60           # segundos
THROTTLE_GLOBAL_LIMIT=120
THROTTLE_GLOBAL_TTL=60
```

En CI: `THROTTLE_ENABLED=false` para las 9 suites existentes, **más una suite nueva
`throttler.e2e-spec.ts`** que levanta su propia instancia de Nest con el throttler
encendido y límite bajo, y verifica el 429. Así el criterio "fuerza bruta bloqueada
tras N intentos" queda cubierto por un test automático en vez de una prueba manual,
sin contaminar al resto.

**Sub-decisión: `trust proxy`.** El PaaS (D10) pone un proxy delante del API. Sin
`app.set('trust proxy', 1)` en `main.ts`, `req.ip` es la IP del proxy para **todas**
las peticiones: el primer atacante que llegue al límite bloquea a todos los usuarios
del sistema a la vez. Con `trust proxy` activo, Express toma la IP real de
`X-Forwarded-For` — la misma cabecera que `AuditInterceptor` ya lee desde la Fase 3,
así que las dos piezas quedan coherentes.

**Sub-decisión: orden de guards.** `ThrottlerGuard` debe correr **antes** que
`JwtAuthGuard` (es más barato y no depende de identidad). Los `APP_GUARD` se ejecutan
en el orden en que Nest resuelve los módulos, así que el `ThrottlerModule` se importa
en `AppModule` **antes** de `AuthModule`. Esto hay que **verificarlo empíricamente**
(un log temporal en cada guard), no darlo por hecho: si el orden sale invertido, el
efecto práctico sobre `/auth/login` es nulo igual (es `@Public()`, `JwtAuthGuard` la
deja pasar y el throttler corre después), pero conviene saber cuál es el real.

**Sub-decisión: storage.** El throttler guarda contadores en memoria del proceso. Con
una sola instancia (D10) alcanza. Si alguna vez se escala a N instancias, el límite
efectivo pasa a ser N×límite — se anota en el README junto con la nota de sticky
sessions de Socket.io, no se resuelve ahora (no hay Redis en la arquitectura).

### D2 — CORS: dos lugares, y el decorador del gateway corre antes que `ConfigModule`

Hay **dos** configuraciones de CORS independientes, y la del gateway tiene una trampa:
las opciones de `@WebSocketGateway({...})` se evalúan cuando se **importa** el
archivo, que es antes de que `ConfigModule.forRoot()` cargue `.env`. Leer
`process.env.CORS_ORIGINS` dentro del decorador puede ver `undefined` según el orden
de imports — un fallo silencioso que abre o cierra el socket de más.

**Decisión:** una sola fuente de verdad, `CORS_ORIGINS` (CSV en `.env`), consumida
desde `main.ts` en los dos lados:

1. `app.enableCors({ origin: <lista>, credentials: true, exposedHeaders: ['Content-Disposition'] })`
   — **no perder `exposedHeaders`**, es lo que hace que `admin-web` pueda leer el
   nombre del archivo exportado (Fase 7).
2. Un `IoAdapter` propio (`RealtimeIoAdapter`) instanciado en `main.ts`, donde
   `ConfigService` ya existe, con `app.useWebSocketAdapter(...)`. El decorador
   `@WebSocketGateway` conserva solo `path: '/ws'`; el CORS sale del adapter.

**Qué va en la lista, por entorno:**

| Entorno | Orígenes |
|---|---|
| Desarrollo | `http://localhost:5173` (Vite), `http://localhost:8081` (Expo web) |
| Producción | el dominio real de `admin-web` (una sola entrada) |

La app móvil nativa **no está sujeta a CORS** (React Native no manda `Origin`), así
que restringir no la rompe. `expo start --web` **sí** lo está: por eso el origen 8081
está en la lista de desarrollo. Si en algún momento `expo start --web` falla con
error de CORS, mirar primero esta lista antes de sospechar del código.

### D3 — Tamaño máximo de body

`app.useBodyParser('json', { limit: '128kb' })` + el mismo límite para `urlencoded`.
El body más grande que acepta el sistema hoy son las notas de un reporte (5 000
caracteres, tope de `sanitizeNotes` desde la Fase 4), así que 128kb es holgado y aun
así corta cualquier intento de agotar memoria con un JSON gigante. No afecta a
`ExportsController` (son GETs que **responden** en stream, no reciben body).

### D4 — El grep de CI necesita allowlist, no puede ser un `grep -q`

`plan.md` pide "grep de CI que falle si aparece [el cliente Prisma crudo] fuera de
`PrismaService`". Tal cual, ese grep **falla hoy**: `AuthService` usa
`this.prisma.user.findUnique()` dos veces, y es una excepción legítima y ya
documentada en el código (corre antes de que exista un usuario autenticado, sobre
tablas sin RLS). La nota operativa de la Fase 6 además amplía el alcance: hay que
cubrir también `forSystem()` (solo `NotificationsService`) y `forUserRaw()`.

**Decisión:** un script propio, `apps/api/scripts/check-prisma-usage.mjs`, en Node
plano (no `tsx` — ver el gotcha de decorator metadata de la Fase 7; acá no hace falta
porque es análisis estático de texto, no boot de Nest). Tres reglas, cada una con su
allowlist explícita en el mismo archivo:

| Regla | Patrón que busca | Allowlist |
|---|---|---|
| Cliente crudo | `this.prisma.<modelo>.` / `new PrismaClient(` fuera de `prisma/` | `auth/auth.service.ts` |
| `forSystem()` | Cualquier llamada | `notifications/notifications.service.ts` |
| `forUserRaw()` | Cualquier llamada | `metrics/`, `exports/`, `audit/audit.interceptor.ts` |

El script imprime archivo:línea de cada violación y sale con código 1. Se expone como
`npm run lint:prisma` en `apps/api` y como job propio del CI. **La allowlist vive en
el script, versionada:** agregar una excepción nueva es un cambio visible en el diff,
que es justamente el punto del control.

### D5 — Filtro global de excepciones: no puede tocar respuestas ya empezadas

Un `AllExceptionsFilter` vía `APP_FILTER` que haga `res.status(...).json(...)` sin
más **rompe el export CSV**: ese endpoint usa `@Res()` y para cuando falla a mitad de
stream ya mandó headers y medio archivo (limitación ya documentada en `plan-fase-7.md`
D2). Escribir JSON encima produce un CSV corrupto en vez de una descarga cortada.

**Decisión:** el filtro chequea `response.headersSent` primero; si ya se enviaron,
loguea el error y **destruye el socket** (`response.destroy()`), que es lo que le dice
al cliente "esta descarga se cortó" de forma inequívoca. Solo si no se enviaron,
responde el JSON.

**Forma de la respuesta** (consistente, en español):

```json
{
  "statusCode": 403,
  "message": "No tenés permiso para editar este reporte",
  "error": "Forbidden",
  "requestId": "...",
  "timestamp": "2026-08-27T...",
  "path": "/reports/abc"
}
```

**Restricción crítica:** las 10 suites e2e ya afirman sobre `res.body.message` y sobre
códigos de estado. En particular el `ValidationPipe` global devuelve `message` como
**array de strings** — ese caso se preserva tal cual (el filtro no reformatea
`BadRequestException` con array). Cualquier excepción que **no** sea `HttpException`
se convierte en 500 con `message: 'Error interno del servidor'` y el detalle real solo
al log — nunca al cliente. Correr `test:e2e` completo inmediatamente después de
agregar el filtro, antes de seguir con el resto de la fase.

### D6 — Logging estructurado con pino

`nestjs-pino` + `pino-http`. Cuatro puntos concretos:

1. **Request-id**: `genReqId` toma `X-Request-Id` entrante si existe (el PaaS suele
   ponerlo), si no `randomUUID()`. Se devuelve en la respuesta y se incluye en el JSON
   de error (D5) para poder cruzar un error del usuario con su línea de log.
2. **Redacción obligatoria**: `req.headers.authorization`, `req.body.password`,
   `req.body.refreshToken`, `req.body.token`. Sin esto, cada `POST /auth/login`
   escribe la contraseña en texto plano en el log del PaaS.
3. **Silencio bajo test**: nivel `silent` cuando `NODE_ENV === 'test'`, o las 10 suites
   quedan ilegibles bajo un muro de JSON.
4. **Riesgo ESM a verificar temprano**: `expo-server-sdk` (v7, ESM puro) ya rompió a
   Jest en este proyecto en la Fase 6 y obligó a un `import()` perezoso. `pino` y
   `nestjs-pino` publican CJS, así que *debería* estar bien — pero **verificarlo
   corriendo `test:e2e` apenas se instale**, no al final de la fase. Si rompe, el
   fallback es el mismo patrón ya probado (import dinámico) o quedarse con el `Logger`
   de Nest + un formateador JSON propio.

### D7 — Healthcheck: liveness y readiness separados

Un `/health` que consulte la base parece más completo, pero en un PaaS es
contraproducente: si Neon tarda o parpadea, el health check falla, el PaaS reinicia el
proceso, y un problema de red externo se convierte en un loop de reinicios que además
tira todos los sockets abiertos.

**Decisión:** dos endpoints, ambos `@Public()`:

- `GET /health` — **liveness**. Solo `{ status: 'ok', uptime, version }`. Sin tocar la
  base. Es el que se configura en el PaaS.
- `GET /health/ready` — **readiness**. Hace `SELECT 1` contra Neon y devuelve 200 o
  503. Es para diagnóstico y para el smoke test post-deploy, no para el PaaS.

Se crea `HealthModule` y se **eliminan** `AppController`/`AppService` (el scaffold
`'Hello World!'` de Nest, sin uso real). Consecuencia: `test/app.e2e-spec.ts` se
reemplaza por `test/health.e2e-spec.ts` — el único test que hoy verifica `GET /`.

### D8 — Backups: Neon PITR primero, `pg_dump` como respaldo externo

`plan.md` pide "backups automatizados de postgres (script `pg_dump` + documentación de
restauración)". Dos hechos cambian el encuadre:

- **Neon ya hace point-in-time recovery** y branching instantáneo. Para el 95% de los
  escenarios reales (borré datos por error, una migración salió mal) restaurar es
  crear un branch en un timestamp anterior, en segundos, sin `pg_dump` de por medio.
- **`pg_dump` no está instalado en esta máquina** (confirmado; ni `psql`).

**Decisión: las dos cosas, con roles distintos y documentados como tales.**

1. **Neon PITR es la primera línea de restauración.** Se documenta el procedimiento en
   `README.md` (crear branch en timestamp T → verificar → repuntar `DATABASE_URL`).
   Cero código.
2. **`pg_dump` es el respaldo *externo*** — cubre el escenario que PITR **no** cubre:
   perder el acceso a la cuenta de Neon. Script `apps/api/scripts/backup-db.ps1`
   (+ variante `.sh`) que corre `pg_dump -Fc` contra `DATABASE_URL` (endpoint
   **directo**, rol `migrator` — el pooled no sirve para dumps) a un `.dump`
   con timestamp.

**Prerequisito manual:** instalar las client tools de PostgreSQL (`winget install
PostgreSQL.PostgreSQL.17` o los binarios sueltos de EDB). **La versión de `pg_dump`
debe ser ≥ la del servidor Neon** o falla con `server version mismatch` — verificar la
versión del server primero. Este es el único prerequisito manual de la Fase 8, y es
chico (a diferencia de los de Fase 9, que dependen de cuentas pagas).

**Verificación del criterio** (backup + restore ejecutados una vez): dump de la base
de desarrollo → crear un branch Neon vacío → `pg_restore` ahí → correr una suite e2e
contra ese branch restaurado. Si las 10 suites pasan contra la copia restaurada, el
backup sirve de verdad (no solo "el archivo se generó").

### D9 — CI: GitHub Actions + branch de Neon dedicado

**Branch de Neon para CI** (decidido al planificar). Un branch de Neon es una copia
copy-on-write instantánea que **hereda schema, roles, GRANTs, políticas RLS y datos**
del branch padre — que es exactamente lo que las suites necesitan, porque ninguna
mockea: prueban las políticas reales de Postgres.

**Verificar al crearlo** (no asumir): que `app_user` y `migrator` existan y conserven
sus GRANTs en el branch nuevo. Los roles en Neon son a nivel proyecto y los GRANTs
viajan con el schema, así que *debería* heredarse todo — pero si algo falta, la
solución conocida es correr `apps/api/prisma/init/01-roles.sql` a mano contra ese
branch, igual que en la Fase 1.

**Sobre la acumulación de datos:** las suites crean entidades con sufijo `randomUUID()`
(verificado en `admin-crud`, `audit-viewer`, `push-notifications`), así que corridas
repetidas **no colisionan** — solo acumulan filas. Se anota en el README: recrear el
branch de CI desde el de desarrollo cada tanto es un click, no una migración.

**Workflow** (`.github/workflows/ci.yml`), cuatro jobs:

| Job | Qué corre | Necesita secrets |
|---|---|---|
| `lint` | `eslint` (api), `oxlint` (admin-web), `expo lint` (mobile) | No |
| `build` | `nest build`, `tsc -b && vite build`, `tsc --noEmit` (mobile) | No |
| `prisma-usage` | `npm run lint:prisma` (D4) | No |
| `e2e` | `npm run test:e2e --workspace apps/api` | **Sí** |

Los tres primeros corren en paralelo; `e2e` es el único que toca la red.

**Secrets de GitHub a cargar** (los primeros dos apuntan al **branch de CI**, no al de
desarrollo): `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_ACCESS_SECRET`.
Variables fijas en el workflow: `PUSH_ENABLED=false` (no gastar cuota de Expo desde
CI), `THROTTLE_ENABLED=false` (D1), `METRICS_TZ=America/Argentina/Buenos_Aires`,
`NODE_ENV=test`.

**Gotchas ya conocidos que el workflow debe respetar:**
- Node **22** (`actions/setup-node`), igual que local.
- `test:e2e` ya corre con `--runInBand` y `NODE_OPTIONS=--experimental-vm-modules` — no
  quitarlos: en paralelo las suites agotan las conexiones del pooler de Neon
  (documentado en la Fase 4) y el motor WASM de Prisma necesita el flag (Fase 2).
- `npm ci` desde la **raíz** (workspaces). El `postinstall` de `apps/api` corre
  `prisma generate`, que no necesita conexión a la base.
- Timeout generoso en el job `e2e` (~15 min): las suites van contra Neon por red real.

**`npm run ci` en la raíz**, equivalente local del workflow, para poder reproducir un
fallo de CI sin pushear. Es también lo que hace verificable el criterio 1 mientras el
repo remoto no exista todavía.

### D10 — Despliegue: PaaS sin Docker, recomendación Render

Decidido al planificar: **PaaS, sin reintroducir Docker**. La base ya está en Neon, así
que un contenedor solo aportaría empaquetado — nada de lo que Docker resuelve bien
(paridad de entorno con una DB local) aplica acá.

**Recomendación concreta: Render.** Motivos, en orden de peso para *este* proyecto:

1. **WebSockets nativos sin configuración** — `RealtimeGateway` es central en las
   Fases 5/6; Fly requeriría Dockerfile (contradice la decisión) y algunos PaaS
   cobran aparte por conexiones persistentes.
2. **Static Site nativo** para `admin-web`, con regla de rewrite SPA (`/*` →
   `/index.html`), imprescindible para React Router.
3. Build desde el monorepo con *root directory* por servicio, sin Dockerfile.

**Dos servicios:**

| Servicio | Tipo | Build | Start |
|---|---|---|---|
| `callreport-api` | Web Service (Node) | `npm ci && npm run build -w apps/api` | `node apps/api/dist/main` |
| `callreport-admin` | Static Site | `npm ci && npm run build -w apps/admin-web` | publica `apps/admin-web/dist` |

**Puntos que hay que resolver, no dar por hechos:**

- **Migraciones**: `prisma migrate deploy` con `DATABASE_URL` (endpoint **directo**,
  rol `migrator`) como paso de release. **Nunca** con el pooled: las migraciones usan
  advisory locks y DDL que no son confiables a través de PgBouncer (ya documentado en
  `.env.example` desde la Fase 1).
- **Una sola instancia.** Socket.io con >1 instancia necesita sticky sessions + un
  adapter de Redis, y el throttler en memoria (D1) se multiplicaría. A <20 agentes una
  instancia sobra. Queda anotado en el README como el límite explícito de escalado.
- **Plan pago, no free tier.** El free tier duerme el servicio por inactividad: mata
  todos los sockets abiertos y retrasa los push. Incompatible con el producto.
- **`VITE_API_BASE_URL` se hornea en build time**, no en runtime — cambiar el dominio
  del API obliga a rebuildear `admin-web`. Anotarlo en el README.
- **`trust proxy`** (D1) y **`CORS_ORIGINS`** (D2) apuntando al dominio real del static
  site.

**El README documenta la ruta elegida en detalle y menciona la alternativa VPS+Docker
en un párrafo**, para dejar registro de por qué no se tomó (cumple la tarea 5 de
`plan.md`, que pide "documentar la opción elegida").

### D11 — URL del API en el móvil para builds reales

`api-config.ts` deriva el host de `Constants.expoConfig.hostUri` — la IP del bundler de
Expo. En un build de producción **no hay bundler**, así que `hostUri` es `undefined` y
la app cae al fallback `http://localhost:3000`: se conecta a sí misma y falla todo.

**Decisión:** `EXPO_PUBLIC_API_URL` con precedencia sobre la heurística actual:

```
process.env.EXPO_PUBLIC_API_URL  →  hostUri (desarrollo)  →  localhost (último recurso)
```

Aunque los builds de tienda sean Fase 9, este cambio va en Fase 8: es config barata y
es **lo que permite probar el móvil contra el backend ya desplegado** al cerrar la
fase. Sin esto, no hay forma de validar el deploy desde la app.

### D12 — Datos demo: script separado, nunca encima del seed de CI

`plan.md` tarea 6 pide "datos demo pulidos para la presentación". **Trampa:** las 10
suites e2e dependen del seed actual (emails concretos como `client1@acmecorp.demo`,
password `Password123!`, 2 tenants). Reescribir `prisma/seed.ts` para que quede lindo
en una demo **rompe el CI**.

**Decisión:** `prisma/seed-demo.ts` como script **aparte** (`npm run seed:demo`), que
corre contra un **branch de Neon de demo**, no contra el de desarrollo ni el de CI.
`prisma/seed.ts` no se toca. Contenido: nombres de empresa y contactos realistas en
español, distribución de tipificaciones creíble (no uniforme), reportes concentrados en
horario laboral de los últimos 14 días, algunos seguimientos pendientes vencidos y
otros al día (para que la pantalla de Seguimientos y los badges se vean con contenido),
y citas futuras para el carrusel del dashboard.

---

## 2. Tareas

### Bloque A — Seguridad (`plan.md` tarea 1)

1. Instalar `@nestjs/throttler` y `helmet` en `apps/api`.
2. `ThrottlerModule.forRootAsync` con los límites de `.env` (D1); `@Throttle` estricto
   sobre `AuthController` (`login` y `refresh`); import en `AppModule` **antes** de
   `AuthModule`; verificar el orden real de los guards con un log temporal.
3. `app.set('trust proxy', 1)` + `app.use(helmet())` + límites de body (D3) en `main.ts`.
4. `CORS_ORIGINS` + `RealtimeIoAdapter` (D2), preservando `exposedHeaders`.
5. `check-prisma-usage.mjs` + `npm run lint:prisma` (D4).
6. Documentar las variables nuevas en `.env.example` con el mismo criterio de las
   existentes (qué hace cada una y por qué).

### Bloque B — Robustez (`plan.md` tarea 2)

7. `AllExceptionsFilter` vía `APP_FILTER` (D5). **Correr `test:e2e` completo acá**,
   antes de seguir.
8. `nestjs-pino` con request-id y redacción (D6). **Correr `test:e2e` de nuevo**, por
   el riesgo ESM.
9. `HealthModule` con `/health` y `/health/ready`; eliminar `AppController`/`AppService`;
   `test/health.e2e-spec.ts` reemplaza a `test/app.e2e-spec.ts` (D7).
10. `scripts/backup-db.ps1` + `.sh` (D8).

### Bloque C — CI (`plan.md` tarea 3)

11. Crear el branch de CI en Neon y verificar roles/GRANTs (D9) — **paso manual, §5**.
12. `.github/workflows/ci.yml` con los 4 jobs (D9).
13. `npm run ci` en el `package.json` raíz.
14. `test/throttler.e2e-spec.ts` (D1) — cubre el criterio 3 de la fase.
15. Smoke test de los tres roles: script que, contra el backend desplegado, hace login
    como agente / client_user / supervisor y ejerce el camino principal de cada uno
    (`scripts/smoke-deploy.mjs`). Node plano contra HTTP, sin DI de Nest.

### Bloque D — Despliegue y documentación (`plan.md` tareas 5 y 6)

16. `EXPO_PUBLIC_API_URL` en `api-config.ts` (D11).
17. Desplegar los dos servicios en Render (D10) — **paso manual asistido, §5**.
18. `README.md` en la raíz: arquitectura en 10 líneas, setup local, variables de
    entorno de los tres apps, procedimiento de migración, despliegue elegido +
    alternativa descartada, restauración (Neon PITR y `pg_restore`), y los límites
    conocidos (una instancia, throttler en memoria, `VITE_API_BASE_URL` en build time).
19. `prisma/seed-demo.ts` + `npm run seed:demo` (D12).
20. Agregar la **Fase 9** a `plan.md` (§6) y la bitácora de Fase 8 a `PROGRESS.md`.

---

## 3. Criterios de aceptación y cómo se verifica cada uno

| Criterio (`plan.md` Fase 8) | Cómo se verifica | Automatizable |
|---|---|---|
| CI en verde: lint, e2e (incl. aislamiento) y builds de los tres apps | Workflow verde en GitHub tras el primer push; reproducible local con `npm run ci` | ✅ |
| Rate limit: fuerza bruta a `/auth/login` bloqueada tras N intentos | `test/throttler.e2e-spec.ts` (D1) | ✅ |
| Backup y restauración ejecutados una vez, documentados | Dump → branch Neon nuevo → `pg_restore` → las 10 suites e2e pasan contra la copia (D8) | ⚠️ requiere instalar client tools |
| Build de producción en Android/iPhone físicos, flujo completo + push | **Pasa a Fase 9** — requiere cuenta EAS, dispositivos y cuentas de tienda | ❌ |

**Criterio adicional que se agrega en esta fase** (no está en `plan.md`, pero sin él
"desplegado" no significa nada): `scripts/smoke-deploy.mjs` verde contra el backend
desplegado, con los tres roles y `GET /health/ready` en 200.

---

## 4. Riesgos de esta fase

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El filtro de excepciones (D5) cambia la forma de las respuestas y rompe suites e2e existentes | **Alta** | Preservar el array de `message` del `ValidationPipe`; correr `test:e2e` inmediatamente después del paso 7, no al final |
| `pino` rompe Jest por ESM, como pasó con `expo-server-sdk` en Fase 6 | Media | Verificar en el paso 8 apenas se instale; fallback conocido (import dinámico) |
| El branch de Neon de CI no hereda roles/GRANTs | Media | Verificar antes de escribir el workflow; fallback: correr `01-roles.sql` a mano (Fase 1) |
| CORS restringido rompe `expo start --web` o el handshake del socket | Media | Los dos orígenes de desarrollo entran en la lista desde el principio (D2); probar los dos clientes antes de cerrar el bloque A |
| El orden de guards deja el throttler después del JWT | Baja | Verificación explícita con logs (D1); impacto práctico nulo sobre `/auth/login` |
| `pg_dump` con versión menor a la del server Neon | Media | Chequear la versión del server **antes** de instalar las client tools (D8) |

---

## 5. Pasos manuales (los hacés vos; el plan dice exactamente qué y cómo verificar)

1. **Crear el repositorio en GitHub** y `git remote add origin ...`. Sin esto el
   criterio 1 no tiene dónde correr. (El `npm run ci` local sirve mientras tanto.)
2. **Crear el branch de CI en Neon** desde el de desarrollo. Anotar sus dos connection
   strings (directo y `-pooler`).
3. **Cargar los 3 secrets** en GitHub → Settings → Secrets → Actions.
4. **Instalar las client tools de PostgreSQL** (versión ≥ la del server Neon), para D8.
5. **Crear la cuenta/servicios en Render** y setear las variables de entorno. Te paso
   la lista exacta cuando lleguemos al paso 17.
6. **Elegir el dominio** de `admin-web` (o usar el `.onrender.com` por defecto) — es lo
   que va en `CORS_ORIGINS` de producción.

---

## 7. Adenda — hallazgos al implementar (D13–D17)

Esta sección se agregó DESPUÉS de escribir el plan de arriba, al validarlo
contra el código antes de implementar. Las decisiones D1–D12 se sostuvieron
todas tal cual; estas cinco no estaban previstas.

### D13 — Dos bloqueadores de deploy que no estaban listados

`main.ts` hacía `app.listen(process.env.PORT ?? 3000)` **sin** `'0.0.0.0'`
como segundo argumento: en Render, un proceso ligado solo a localhost no
es alcanzable por el health check externo del PaaS. Se agregó el bind
explícito. También faltaba `app.enableShutdownHooks()` — sin eso, un
redeploy (SIGTERM) corta sockets y conexiones de Prisma en seco en vez de
cerrarlos en orden.

### D14 — Validación de env al arrancar

`ConfigModule.forRoot({ isGlobal: true })` no tenía `validate`. Se agregó
`src/config/env.validation.ts`: corta el arranque con un mensaje explícito
si faltan `DATABASE_URL`/`APP_DATABASE_URL`/`JWT_ACCESS_SECRET` (siempre) o
`CORS_ORIGINS` (solo si `NODE_ENV=production`) — mejor eso que un 500 raro
en runtime por una variable mal escrita en el hosting.

### D15 — `lint:ci` como gate real (y lo que destapó)

`apps/api`'s `lint` corre con `--fix`, así que nunca había fallado en la
práctica aunque tuviera errores no auto-fixables — nadie lo había notado.
Se agregó `lint:ci` (mismo comando, sin `--fix`) para que sea el que
realmente bloquee en CI. Al correrlo la primera vez aparecieron ~540
errores preexistentes de las Fases 2–7: la gran mayoría (~530) era formato
de Prettier nunca aplicado (líneas largas sin envolver, acumuladas en 16
archivos porque `--fix` nunca se corrió con diagnóstico previo) — se
normalizó con un `eslint --fix` de una sola vez sobre todo el proyecto,
**cero cambios de lógica**, verificado corriendo las 11 suites e2e
completas después. El resto era `@typescript-eslint/no-unsafe-*` sobre
`res.body` sin tipar en las suites e2e (código de test). Se resolvió con
un override de ESLint que relaja esas 4 reglas específicamente para
`test/**/*.ts` (no para `src/`) — reescribir
cientos de asserts en specs de las Fases 2–7 no tenía beneficio real de
tipos y estaba fuera del alcance de esta fase. Los 3 errores reales
encontrados en `src/` (una regex con BOM literal disparando
`no-irregular-whitespace` en un test, una variable sin usar, y dos
`no-base-to-string` genuinos en `csv.util.ts`/`all-exceptions.filter.ts`)
sí se corrigieron de verdad. También se agregaron `typecheck` en
`apps/mobile` y `lint`/`build`/`test:e2e`/`ci` en el `package.json` raíz
(no existía ninguno).

**Bug de deploy real descubierto en el camino:** `start:prod` apuntaba a
`node dist/main`, pero `tsconfig.json` tiene `rootDir: "./"` (necesario
porque `prisma.config.ts` vive en la raíz de `apps/api`, fuera de `src/`),
así que el build real cae en `dist/src/main.js`. Este script nunca se
había corrido (nadie desplegó todavía) — corregido a `node dist/src/main`
y verificado arrancando la build de producción real en local.

### D16 — `apps/admin-web/.env` desincronizado

Definía `VITE_API_MODE`/`VITE_API_URL` (variables de la Fase 2, cuando
admin-web corría sobre el mock), pero `src/api/config.ts` lee
`VITE_API_BASE_URL` desde la Fase 3 — ninguna de las dos primeras tenía
efecto real, disimulado en desarrollo porque el fallback coincide
(`localhost:3000`). Un build de producción heredaría el mismo silencio.
Corregido el `.env` y retirado el mensaje muerto de `AppStore.tsx` que
todavía mencionaba `VITE_API_MODE=real` como si fuera Fase 3 sin
implementar.

### D17 — El grep de D4 debe excluir `prisma.service.ts` entero

`this.$connect()`, `this.$extends(`, `this.$transaction(` y
`tx.$executeRaw` dentro de `PrismaService` son la implementación de la
puerta (`forUser`/`forSystem`/`forUserRaw`), no una violación —
`check-prisma-usage.mjs` excluye ese archivo por completo en vez de
intentar que el patrón de "cliente crudo" los esquive por coincidencia.

---

## 6. Fase 9 (nueva) — Publicación móvil

Se agrega a `plan.md` como fase propia. Recoge todo lo que depende de cuentas pagas y
hardware físico, incluidos los criterios "en dispositivo físico" que quedaron
pendientes desde las Fases 1–7:

- `npx eas init` (llena `extra.eas.projectId`, hoy `""` — bloqueador del push real
  desde la Fase 6), `eas.json` con perfiles dev/preview/production.
- Development build para probar **push remoto real** (Expo Go ya no lo entrega desde el
  SDK 53 — documentado en la bitácora de Fase 6).
- Íconos, splash, `app.json` con `name`/`slug` reales (hoy dicen `"mobile"`) y bundle
  IDs de iOS/Android.
- Builds firmados, subida a Play Store y App Store, notas para la revisión de Apple con
  cuentas demo por rol.
- **Las pasadas manuales acumuladas de las Fases 1–7**: flujo del agente en <30s, modo
  avión con la cola offline, dos sesiones simultáneas para el tiempo real, resync tras
  background, share sheet del CSV/PDF, y el navegador real con clicks para `admin-web`.
