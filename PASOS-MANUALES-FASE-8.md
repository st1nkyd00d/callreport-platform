# Pasos manuales pendientes — Fase 8

Todo el código de la Fase 8 está commiteado y verificado (`npm run ci` en
verde: lint + build de las 3 apps + 11 suites e2e / 52 tests contra Neon).
Quedan 4 pasos que solo se pueden hacer a mano, con cuentas/herramientas
que no están disponibles en esta sesión. Están en orden recomendado —
cada uno debería hacerse antes de intentar el siguiente que depende de él.

Ver `README.md` para el detalle de referencia de cada tema; este archivo
es la checklist de ejecución.

---

## 1. Crear el repositorio en GitHub — ✅ HECHO (2026-08-28)

Repo: https://github.com/st1nkyd00d/callreport-platform — remote `origin`
conectado, `master` pusheado y al día.

1. ~~Crear un repo nuevo en GitHub (vacío, sin README/gitignore — ya
   existen acá).~~
2. ~~Conectarlo~~:
   ```bash
   git remote add origin <url-del-repo>
   git push -u origin master
   ```
3. Sin esto, `.github/workflows/ci.yml` no tiene dónde correr. Mientras
   tanto, `npm run ci` local es el equivalente exacto.

---

## 2. Crear el branch de CI en Neon + cargar los secrets — ✅ HECHO (2026-08-28)

Branch de CI: `ep-fragrant-mud-av5jwha8` (host base, sin `-pooler`).
Permisos verificados a mano (`app_user`: SELECT/INSERT/UPDATE sí, DELETE
no, BYPASSRLS false; `migrator`: dueño de las tablas, BYPASSRLS true) —
heredó todo bien del branch de desarrollo, no hizo falta correr
`01-roles.sql`. Los 3 secrets ya están cargados en GitHub Actions.

**Pendiente de verificar**: todavía no se confirmó un run real de
`.github/workflows/ci.yml` en verde (dispara con push/PR a `main`/
`master`, o PR abierto). Hacer un push cualquiera y revisar la pestaña
**Actions** del repo para confirmar que el job `e2e` pasa contra este
branch antes de dar el paso por 100% cerrado.

1. ~~En el dashboard de Neon, con el proyecto de desarrollo abierto: crear
   un **branch nuevo**~~ (copia copy-on-write instantánea — hereda schema,
   roles, GRANTs, políticas RLS y los datos del seed).
2. ~~Anotar las dos connection strings de ese branch nuevo~~:
   - **Directa** (rol `migrator`) → va en el secret `DATABASE_URL`.
   - **Pooled**, host `-pooler` (rol `app_user`) → va en el secret
     `APP_DATABASE_URL`.
3. ~~Verificar que `app_user` y `migrator` conserven sus GRANTs en el
   branch nuevo~~ (deberían heredarse solos). Si algo falla al correr las
   suites e2e contra este branch con un error de permisos, correr
   `apps/api/prisma/init/01-roles.sql` a mano ahí (mismo procedimiento que
   en la Fase 1).
   - **Nota (aprendida en el paso 3, sección de restore)**: los GRANTs se
     heredan solos únicamente si las tablas siguen siendo dueño de
     `migrator`. Si en algún momento se recrea el schema con
     `pg_restore --no-owner` (o cualquier operación que cambie el owner),
     las tablas quedan de otro dueño (ej. `neondb_owner`) y el
     `ALTER DEFAULT PRIVILEGES FOR ROLE migrator` de `01-roles.sql` deja
     de aplicar — hay que re-otorgar los GRANTs a mano:
     ```sql
     GRANT USAGE ON SCHEMA public TO app_user;
     GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
     ```
     Esto no debería pasar en un branch de CI creado normalmente desde el
     dashboard (nunca se corre `pg_restore` ahí), pero si alguna vez un
     branch de Neon tira `permission denied for table X` en las suites
     e2e, esta es la causa más probable y el fix de una línea.
4. ~~En GitHub → el repo del paso 1 → **Settings → Secrets and variables →
   Actions → New repository secret**, cargar los 3~~:
   - `DATABASE_URL` (del branch de CI, endpoint directo)
   - `APP_DATABASE_URL` (del branch de CI, endpoint pooled)
   - `JWT_ACCESS_SECRET` (podés generar uno nuevo solo para CI:
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
5. Con eso cargado, cualquier push/PR ya dispara `.github/workflows/ci.yml`
   completo (4 jobs: lint, build, prisma-usage, e2e).
6. **Nota para más adelante**: las suites crean datos con sufijo
   `randomUUID()`, así que corridas repetidas no rompen nada, solo
   acumulan filas. Si el branch de CI se ensucia demasiado, recrearlo
   desde el de desarrollo es un click en el dashboard de Neon.

---

## 3. Backup y restauración (instalar `pg_dump`/`psql`) — ✅ HECHO (2026-08-28)

Client tools instalados (`PostgreSQL.PostgreSQL.18` vía winget, matchea la
versión del server de Neon 18.6). Backup generado y restauración
verificada de punta a punta contra un branch de prueba: **11/11 suites,
52/52 tests en verde**.

**Dos bugs reales encontrados y corregidos durante esta verificación**
(ya commiteados, tenerlos en cuenta para cualquier script futuro que
arme connection strings a mano):

- `backup-db.ps1` / `backup-db.sh` le pasaban `DATABASE_URL` tal cual del
  `.env` a `pg_dump`, incluyendo `&schema=public` — ese parámetro es una
  extensión propia de Prisma que **libpq no entiende**
  (`pg_dump: error: invalid URI query parameter: "schema"`). Ambos
  scripts ahora lo eliminan de la URL antes de invocar `pg_dump`. Aplica
  a cualquier herramienta basada en libpq (`pg_dump`, `pg_restore`,
  `psql`) a la que se le pase una connection string copiada directo del
  `.env` — siempre hay que sacarle `schema=`.
- Un branch de Neon "vacío" **no es realmente vacío para probar
  restore**: crear un branch siempre es copy-on-write desde un padre, así
  que hereda su schema/data completos. Para probar una restauración desde
  cero contra un branch así, usar `pg_restore --clean --if-exists` (dropea
  cada objeto antes de recrearlo) en vez de buscar una forma de crear un
  branch realmente en blanco.
  - Efecto secundario de eso: si se usa `--no-owner` junto con `--clean`,
    las tablas recreadas quedan con el owner de la conexión (ej.
    `neondb_owner`) en vez de `migrator`, así que los GRANTs
    a `app_user` heredados de `ALTER DEFAULT PRIVILEGES FOR ROLE
    migrator` (en `01-roles.sql`) se pierden y las suites e2e fallan con
    `permission denied for table X` — ver la nota en el paso 2 arriba
    para el fix.

1. Antes de instalar nada, confirmar la **versión del server de Neon**
   (aparece en el dashboard de Neon, o corriendo `SELECT version();` desde
   el SQL editor de Neon). `pg_dump` debe ser de una versión **igual o
   mayor** a esa, o falla con `server version mismatch`.
2. Instalar las client tools de PostgreSQL con esa versión:
   - Windows: `winget install PostgreSQL.PostgreSQL.<version>` (o los
     binarios sueltos de EDB si preferís no instalar el server completo).
   - Confirmar que quedaron en el PATH: `pg_dump --version`.
3. Correr el backup:
   ```powershell
   cd apps/api
   .\scripts\backup-db.ps1
   ```
   (o `./scripts/backup-db.sh` si corrés desde Git Bash/WSL). Genera un
   `.dump` con timestamp en `apps/api/backups/` (gitignoreado).
4. **Verificar que la restauración funciona de verdad** (no solo que el
   archivo se generó):
   - Crear un branch de Neon **vacío** nuevo (sin copiar datos).
   - `pg_restore --no-owner --no-privileges -d <connection-string-del-branch-vacio> apps/api/backups/callreport-<timestamp>.dump`
   - Apuntar `DATABASE_URL`/`APP_DATABASE_URL` de tu `.env` local a ese
     branch restaurado y correr `npm run test:e2e` — si las 11 suites
     pasan, la restauración sirve de verdad.
   - Volver a apuntar tu `.env` al branch de desarrollo original.
5. Marcar el criterio de `plan.md` (Fase 8) como cumplido una vez hecho
   esto.

---

## 4. Desplegar en Render

1. Crear una cuenta en [Render](https://render.com) si no tenés una.
2. **New → Blueprint**, conectar el repo de GitHub (paso 1). Render lee
   `render.yaml` de la raíz y propone los dos servicios:
   - `callreport-api` (Web Service, Node)
   - `callreport-admin` (Static Site)
3. Al crear `callreport-api`, Render va a pedir los secrets marcados
   `sync: false` en `render.yaml`:
   - `DATABASE_URL` → el de **producción** en Neon (un branch propio,
     distinto al de desarrollo y al de CI — recomendado).
   - `APP_DATABASE_URL` → ídem, endpoint pooled.
   - `JWT_ACCESS_SECRET` se genera solo (`generateValue: true`).
4. **Elegir plan pago** ("Starter" o superior) para `callreport-api` — el
   free tier duerme el servicio por inactividad y mata los sockets de
   Socket.io. `callreport-admin` (static site) no necesita plan pago.
5. Antes del primer deploy real, correr las migraciones contra la base de
   producción **una vez** desde tu máquina:
   ```bash
   DATABASE_URL="<connection-string-directa-de-produccion>" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```
   (o `cd apps/api && DATABASE_URL="..." npx prisma migrate deploy`).
6. Dejar que Render termine el primer deploy de los dos servicios.
7. Si Render **no pudo** asignarle a los servicios exactamente los
   subdominios `callreport-api.onrender.com` / `callreport-admin.onrender.com`
   (ya estaban tomados por otra cuenta), actualizar a mano:
   - En `callreport-api` → variable `CORS_ORIGINS` → el dominio real de
     `callreport-admin`.
   - En `callreport-admin` → variable `VITE_API_BASE_URL` → el dominio
     real de `callreport-api` (esto requiere **rebuild** del static site,
     no solo un restart — Vite lo hornea en build time).
8. Verificar el deploy de punta a punta:
   ```bash
   SMOKE_BASE_URL=https://<tu-dominio-de-callreport-api> node apps/api/scripts/smoke-deploy.mjs
   ```
   Tiene que dar `smoke-deploy: todo OK` (health/ready + login de los 3
   roles + una acción real de cada uno).
9. Abrir `callreport-admin` en el navegador y loguearte como
   `supervisor@callreport.demo` / `Password123!` para confirmar que el
   panel habla con el API real.

**Nota**: los usuarios de producción todavía son los del seed de
desarrollo (`Password123!` para todos) hasta que corras
`npm run seed:demo -- --confirm` contra un branch de **demo** separado
(ver `README.md` → "Datos demo") o crees usuarios reales desde
`callreport-admin`.
