# Plan de implementación — FASE 7

> Exportación (CSV/PDF) y visor de auditoría.
> Detalle de ejecución de la Fase 7 de `plan.md`. El plan maestro define el **qué**;
> este archivo define el **cómo**, los bloqueadores encontrados al revisar el código
> ya escrito (Fases 1–6) y las decisiones tomadas antes de empezar.
> Al terminar, la bitácora va a `PROGRESS.md` (ver `CLAUDE.md`).

---

## 0. Estado de partida (lo que ya existe y condiciona la fase)

| Pieza | Estado | Implicancia para Fase 7 |
|---|---|---|
| `audit_logs` | Se escribe desde Fase 3 (`AuditInterceptor`), **nadie la lee**; `REVOKE UPDATE, DELETE` aplicado en Fase 1 | Falta el endpoint de lectura… y falta RLS (ver D4) |
| `audit_logs` (RLS) | **Sin RLS** — el `enable_rls` de Fase 1 la excluyó a propósito ("no es multi-tenant") | Bloqueante de seguridad al abrir el visor (D4) |
| `AuditLog.diff` | Diff superficial (`before: null`, `after: <valor del body>`) desde Fase 3 | El visor muestra solo el "después"; se documenta, no se rehace |
| `PrismaService.forUserRaw()` | Existe (Fase 6, lo usa `MetricsModule`) | Es la base del streaming del CSV — la inversión ya estaba prevista |
| `pg` + `@prisma/adapter-pg` | Ya son dependencias de `apps/api` | No hace falta driver nuevo para el SQL crudo del export |
| `ReportsService.findAll()` | Filtros `from`/`to`/`campaignId`/`dispositionId` + cursor | El export reusa **los mismos** parámetros (criterio: "mismos filtros del dashboard") |
| `GET /reports/summary` | Devuelve `{ total, byDisposition[] }` con RLS | Alimenta el "N reportes a exportar" del móvil **y** las tarjetas del PDF |
| `(client)/_layout.tsx` | `Tabs` con Inicio / Seguimientos | Suma la pestaña "Exportar" (D9) |
| `ExportarPage.tsx` (admin-web, mock) | Prototipo Stitch completo: rango, tipificación, conteo, CSV/PDF, "Descargar y compartir" | Es el diseño de referencia de la pantalla móvil real |
| `AuditoriaPage.tsx` (admin-web, mock) | Tabla + filtros usuario/acción + fila expandible con el diff, sobre `AppStore` | Se conserva la UI, se cambia la fuente de datos (mismo criterio que `MetricasPage` en Fase 6) |
| `apps/mobile` | **Sin** `expo-file-system` ni `expo-sharing` | Dos dependencias nuevas (D6) |
| `apps/api` | Sin `pdfmake` | Una dependencia nueva (D5) |
| `main.ts` | `app.enableCors()` sin `exposedHeaders` | El navegador no puede leer `Content-Disposition` (D6) |
| Seed | 189 `call_reports` | Hace falta un inflado a ~50 000 para el criterio 1 (D8) |

---

## 1. Decisiones y bloqueadores (resolver antes de escribir código)

### D1 — Streaming del CSV: keyset por lotes, no `DECLARE CURSOR`

`plan.md` dice "cursor de PostgreSQL en lotes (p. ej. 500 filas) pipeado al response".
La intención (memoria constante) se respeta; el mecanismo cambia, por tres razones
concretas de este proyecto:

1. **El runtime se conecta al endpoint *pooled* de Neon** (`APP_DATABASE_URL`,
   PgBouncer en modo transacción). Un `DECLARE ... CURSOR` vive dentro de una
   transacción: mientras dure la descarga entera, esa conexión del pool queda
   pinneada. Con un cliente móvil lento en 3G, eso puede ser minutos.
2. **Las transacciones interactivas de Prisma tienen timeout** (5 s por defecto).
   Habría que subirlo a un valor arbitrario y grande; una descarga que se pasa de
   ese valor muere a mitad de stream, con headers ya enviados (irrecuperable, ver D2).
3. `forUserRaw()` ya existe y encaja perfecto con lotes cortos.

**Decisión:** paginación **keyset** en lotes de 500, cada lote en su propia
transacción corta vía `forUserRaw()`:

```sql
SELECT ... FROM call_reports r
JOIN campaigns c ... JOIN dispositions d ... JOIN users u ...
WHERE <filtros> AND (r.created_at, r.id) < ($lastCreatedAt, $lastId)
ORDER BY r.created_at DESC, r.id DESC
LIMIT 500
```

La comparación de tuplas `(created_at, id) < (...)` es exacta y usa el índice
`(tenant_id, created_at)` que ya existe. RLS se aplica igual en cada lote (el
`set_config` corre dentro de cada transacción). Memoria: nunca más de 500 filas
vivas + el buffer del socket.

*Consecuencia menor documentada:* entre lotes pueden entrar reportes nuevos. Como
el orden es `created_at DESC`, los nuevos entran "arriba" de un punto que el cursor
ya pasó → **no** aparecen en el archivo y **no** duplican filas. Es el
comportamiento correcto para un export "hasta el momento en que lo pediste".

### D2 — Backpressure y errores a mitad de stream

Escribir sin mirar el resultado de `res.write()` hace que Node acumule los lotes en
memoria si el cliente consume más lento de lo que la base entrega — exactamente el
criterio de aceptación que hay que cumplir. **Decisión:** helper `writeChunk()` que,
cuando `res.write()` devuelve `false`, espera el evento `drain` antes de pedir el
lote siguiente.

El endpoint usa `@Res()` de Express directo (sale del pipeline de interceptores de
Nest; los interceptores de auditoría no aplican a GETs sin `@AuditEntity`, así que
no se pierde nada). Reglas:

- Toda validación (fechas, `tenantId`, rol) corre **antes** del primer `write()`,
  así un error todavía puede ser un 400/403 JSON normal.
- Un error después del primer byte ya no puede cambiar el status: se loguea y se
  hace `res.destroy(err)` → el cliente ve una descarga truncada/fallida, no un
  archivo CSV silenciosamente incompleto con 200.
- `res.on('close')` sin `res.writableEnded` ⇒ el cliente abortó: cortar el bucle de
  lotes (no seguir consultando la base para nadie).

### D3 — El CSV es un archivo que abre Excel: BOM, escapado e inyección de fórmulas

- **BOM UTF-8** (`﻿`) al inicio: sin él, Excel muestra "Ma­rí­a" en vez de "María".
  El mock (`ExportarPage.tsx:80`) ya lo hacía; se replica en el servidor.
- **Escapado**: comillas dobles siempre, `"` interno duplicado, saltos de línea de
  las notas convertidos a espacio (una fila = una línea).
- **Inyección de fórmulas (CSV injection)**: `notes`, `detailText` y `contactName`
  son texto libre escrito por agentes. Una celda que empieza con `=`, `+`, `-`, `@`,
  tab o CR se ejecuta como fórmula al abrirla en Excel/Sheets. **Decisión:** prefijar
  esas celdas con `'`. Es el mismo estándar del proyecto (la base y el servidor son
  el límite real, no la UI).
- **Separador**: coma (como el mock), no `;`. Si el cliente final usa Excel en es-AR
  y le abre todo en una columna, se agrega `?sep=;` como parámetro opcional — se deja
  anotado, no se implementa por adelantado.
- **Cabeceras en español** (criterio de `plan.md`): `ID`, `Fecha`, `Campaña`,
  `Tipificación`, `Contacto`, `Teléfono`, `Email`, `Agente`, `Cita agendada`,
  `Detalle`, `Notas`, `Seguimiento resuelto`. Para staff se agrega `Empresa` (el
  export global cruza tenants; ver D7).
- **Nombre del archivo**: `Content-Disposition: attachment; filename="callreport_<tenant>_<from>_a_<to>.csv"`
  con `filename*=UTF-8''…` para nombres con acentos.

### D4 — `audit_logs` no tiene RLS y el visor la va a exponer (bloqueante)

Hoy `audit_logs` está fuera de `enable_rls` a propósito ("no es multi-tenant"), pero
sí es **cross-tenant**: contiene acciones de todos los tenants, con IPs y diffs de
bodies. Mientras nadie la leyera, no importaba. El visor de esta fase la lee.

Con `@Roles('super_admin','supervisor')` alcanzaría a nivel de aplicación, pero el
estándar que viene sosteniendo el proyecto desde la Fase 1 es que **la base es el
límite real**. Un futuro endpoint que se olvide del decorador no puede convertirse en
una fuga.

**Decisión:** migración `audit_logs_rls`:

- `ENABLE` + `FORCE ROW LEVEL SECURITY` en `audit_logs`.
- `audit_logs_staff_select`: `SELECT` solo si `app.role IN ('supervisor','super_admin')`.
- `audit_logs_self_insert`: `INSERT` con `WITH CHECK (user_id = current_setting('app.user_id', true))`.
  **Esto es imprescindible**: el `AuditInterceptor` escribe con `forUser()` para
  *todos* los roles (un agente creando un reporte, un `client_user` resolviendo un
  seguimiento). Sin esta política, encender RLS rompe cada mutación del sistema.
- Sin políticas de `UPDATE`/`DELETE` — y el `REVOKE` de Fase 1 sigue vigente
  (doble cierre: ni grant, ni política).

**Verificación manual** (script Node con `pg` como `app_user`, igual que en Fases 4 y 6
— no hay `psql` en este entorno):
1. `app.role='client_user'` + tenant de Acme → `SELECT * FROM audit_logs` = **0 filas**.
2. `app.role='supervisor'` → devuelve filas.
3. `app.role='agent'`, `app.user_id=<agente>` → `INSERT` con ese `user_id` funciona;
   con el `user_id` de otro usuario → falla por la política.
4. `UPDATE audit_logs …` y `DELETE FROM audit_logs` → `permission denied`
   (re-verificación explícita del criterio de aceptación 4).

### D5 — PDF con `pdfmake`: fuentes estándar, sin TTF embebidos

`pdfmake` en Node exige un diccionario de fuentes. La ruta habitual es embeber
Roboto (`.ttf`), lo que obliga a versionar binarios y a configurar `assets` en
`nest-cli.json` para que `nest build` los copie a `dist/`.

**Decisión:** usar las **fuentes estándar del formato PDF** (Helvetica), que no
requieren archivo alguno:

```ts
const fonts = { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } };
```

Cero binarios en el repo, cero configuración de build. **Riesgo controlado:** la doc
de pdfmake advierte que las standard 14 usan el code page ANSI (WinAnsi cubre
`á é í ó ú ñ ¿ ¡`, pero no, por ejemplo, `€` en todas las combinaciones). *Paso de
verificación obligatorio del bloque:* generar un PDF con "Peña, ¿está?" y abrirlo. Si
sale mal, el fallback es embeber Roboto + `nest-cli.json` con `assets`, y queda
anotado en `PROGRESS.md`.

**Chequeo de módulos (precedente de la Fase 6):** `expo-server-sdk` v7 era ESM puro y
rompía Jest en todas las suites e2e por estar en el árbol de `AppModule`. `pdfmake`
0.2.x publica CJS, así que un `import` estático debería andar — pero se verifica
corriendo **una** suite e2e apenas se instala, antes de escribir el resto del bloque.
Si rompe, el patrón ya conocido es `import()` dinámico y perezoso dentro del service.

El PDF es un **resumen ejecutivo**, no el dataset: encabezado (tenant + rango +
generado el), tarjetas de totales por tipificación (de `ReportsService.summary()`,
ya existente) y una tabla con los primeros **200** reportes + la nota "Descargue el
CSV para el detalle completo" que pide `plan.md`. Se genera en memoria (cientos de
KB) y se manda de una — no necesita streaming, y por eso el límite de filas no es
negociable.

### D6 — Autenticación de la descarga: header, nunca token en la query

Un `?token=…` termina en logs de acceso, en el historial del navegador y en el
`Referer`. **Decisión:** `Authorization: Bearer` en todos los casos.

**Móvil (SDK 57).** `FileSystem.downloadAsync()` es API legacy y **tira en runtime**;
la API vigente es:

```ts
const task = File.createDownloadTask(url, new File(Paths.cache, nombre), { headers: { Authorization: `Bearer ${token}` } });
const file = await task.downloadAsync();
await Sharing.shareAsync(file.uri, { mimeType, UTI });
```

Dos consecuencias:
- Esa descarga **no pasa por `authFetch()`**, así que no hereda el reintento-en-401
  con refresh. Mitigación en dos pasos: (a) la pantalla ya llama
  `GET /reports/summary` vía `authFetch` para mostrar "N reportes a exportar" —
  eso refresca el access token si estaba vencido, justo antes de descargar; (b) si
  aun así el download vuelve 401, se llama `refreshAccessToken()` y se reintenta
  **una** vez, a mano.
- Se descarga a `Paths.cache` (el sistema puede limpiarlo; es un archivo efímero que
  se comparte y se olvida), con nombre único por rango para no pisar descargas previas.

Dependencias nuevas: `npx expo install expo-file-system expo-sharing`.

**Admin-web.** `fetch` con header → `blob()` → `URL.createObjectURL` → `<a download>`.
El blob queda entero en memoria del navegador (~10 MB para 50 000 filas: aceptable en
un panel de escritorio; el criterio de memoria constante es del **servidor**).
**Bloqueante chico:** `Content-Disposition` no es una cabecera CORS-safelisted, así que
hoy el JS del navegador no puede leer el nombre del archivo. Hay que pasar
`app.enableCors({ exposedHeaders: ['Content-Disposition'] })` en `main.ts` — y dejarlo
anotado junto al resto de la deuda de CORS que Fase 8 tiene que cerrar.

### D7 — Alcance del export global de `super_admin`

`plan.md` pide "exportación global (todos los tenants o uno) para `super_admin`".
RLS ya le da a staff acceso a todos los tenants, así que el endpoint es el mismo.

**Decisión:** `?tenantId=<uuid>` es un filtro **opcional** que solo tiene efecto para
staff. Para un `client_user` se **ignora** (no se responde 400): es exactamente el
criterio que fija `isolation.e2e-spec.ts` desde la Fase 2 — un tenant ajeno forzado en
la query devuelve 200 con las filas ya filtradas por RLS, nunca un error que revele
si ese tenant existe. La columna `Empresa` aparece en el CSV solo cuando quien
exporta es staff.

### D8 — Seed inflado a 50 000: script aparte, no el seed

Meter 50 000 filas en `prisma/seed.ts` haría lento e incómodo cada re-seed de
desarrollo. **Decisión:** script separado `prisma/inflate-reports.ts` (corre con
`tsx`, como rol `migrator`, igual que el seed):

- No borra nada: reusa tenants/campañas/tipificaciones/agentes/turnos existentes.
- `createMany` en lotes de 5 000, fechas repartidas en los últimos 180 días.
- Marca cada fila sintética con `externalCallId = 'bulk:<n>'` (columna que ya existe,
  reservada para telefonía futura) → la limpieza es un `deleteMany` exacto por ese
  prefijo, sin riesgo de llevarse datos del seed real.
- Scripts: `npm run inflate -- --count=50000` y `npm run inflate -- --clean`.

**Medición de memoria** (criterio 1). En vez de una lectura a ojo con `--inspect`,
un script reproducible `scripts/export-memory-check.ts`: levanta la app Nest, dispara
la descarga completa con un **consumidor lento** (lee el stream con pausas, que es el
caso que realmente rompe si falta backpressure), muestrea
`process.memoryUsage()` cada 250 ms e imprime RSS/heap máximos + filas y bytes
escritos. Criterio numérico: el heap usado no debe crecer de forma monótona con el
avance de la descarga (se acepta el ruido del GC). Se guarda la salida en
`PROGRESS.md`.

### D9 — Móvil: pestaña "Exportar", no botón + hoja en el dashboard

`plan.md` dice "botón Exportar en el dashboard → hoja con CSV/PDF". El prototipo de
diseño (`pages/mobile/cliente/ExportarPage.tsx`) resolvió lo mismo como una **pestaña
propia** con rango, tipificación, conteo previo y selector de formato — más aire para
los filtros que un bottom sheet, y ya está diseñado.

**Decisión:** seguir el prototipo (`(client)/exportar.tsx`, tercera pestaña, ícono de
descarga), y que el dashboard tenga un acceso directo que navegue a esa pestaña
llevando el rango y la tipificación activos como valores iniciales. Se registra como
desvío deliberado respecto del texto de `plan.md`.

---

## 2. Trabajo por bloques

### Bloque A — Base de datos (1 migración)

`prisma/migrations/20260827xxxxxx_audit_logs_rls/migration.sql` (D4):
`ENABLE` + `FORCE ROW LEVEL SECURITY`, políticas `audit_logs_staff_select` y
`audit_logs_self_insert`. Sin cambios en `schema.prisma` (no hay columnas nuevas) →
la migración se crea con `--create-only` y se escribe el SQL a mano, mismo
procedimiento que las migraciones de RLS de las Fases 1/3/4/6.

Cierre del bloque: las 4 pruebas SQL a mano de D4 contra Neon.

### Bloque B — `ExportsModule` (backend)

`apps/api/src/exports/`

| Archivo | Contenido |
|---|---|
| `exports.module.ts` | Importa `ReportsModule` (para reusar `summary()` en el PDF) |
| `export-filters.ts` | Parseo compartido de `from`/`to`/`campaignId`/`dispositionId`/`tenantId` — mismas reglas que `reports.controller.ts`, sin DTO de clase (el `ValidationPipe` global rompería el criterio de D7) |
| `csv.util.ts` | `escapeCsvCell()` (comillas + antiinyección, D3), `toCsvRow()`, cabeceras en español |
| `exports.service.ts` | `streamReportsCsv(user, filters, res)` — bucle keyset de 500 (D1) sobre `forUserRaw()`, con `writeChunk()`/backpressure (D2); `buildReportsPdf(user, filters)` → `Buffer` |
| `exports.controller.ts` | `GET /exports/reports.csv`, `GET /exports/reports.pdf` |

Detalles del SQL del CSV: un solo `SELECT` con `JOIN` a `campaigns`, `dispositions`,
`users` (agente) y `tenants` (solo para staff); `WHERE` armado con parámetros
posicionales (nunca interpolación de strings); `LIMIT 500` + tupla keyset.

El PDF reusa `ReportsService.summary()` para las tarjetas y `findAll()` (limit 200)
para la tabla — cero SQL nuevo.

### Bloque C — Visor de auditoría (backend)

`apps/api/src/audit/` (el módulo ya existe; se le agrega el lado de lectura)

- `audit.service.ts` (nuevo) + `audit.controller.ts` (nuevo),
  `@Roles('super_admin','supervisor')` a nivel de clase.
- `GET /admin/audit-logs?userId&entityType&action&from&to&after&limit` — paginación
  por cursor sobre `(created_at, id)` desc, mismo criterio que `GET /reports`;
  `include` del usuario (`fullName`, `email`) para la columna "Usuario" de la tabla.
  Vía `forUser()` (RLS del bloque A hace el corte real).
- `GET /admin/audit-logs/filters` — valores distintos de `action` y `entityType`
  presentes en la tabla, para poblar los selects sin hardcodear. Motivo: el tipo
  `AuditAction` de `packages/shared` lista acciones que el backend **nunca escribe**
  (`suspend`, `clock_in`, `clock_out` son del mock de Fase 3); el select del panel
  debe reflejar lo que existe de verdad.
- Sin endpoints de escritura, borrado ni edición. Nunca.

### Bloque D — Móvil (cliente)

1. `npx expo install expo-file-system expo-sharing`.
2. `src/lib/export-download.ts`: arma la URL con los filtros, resuelve token fresco,
   `File.createDownloadTask(...)` + reintento único en 401 (D6), `Sharing.shareAsync`
   con `mimeType` `text/csv` / `application/pdf` y `UTI` `public.comma-separated-values-text` /
   `com.adobe.pdf`. Chequea `Sharing.isAvailableAsync()`.
3. `(client)/exportar.tsx` (D9): rango (reusa los chips del dashboard), tipificación
   (mismo agrupado por `code` que ya usa el dashboard), conteo previo con
   `GET /reports/summary` vía `authFetch`, selector CSV/PDF, botón "Descargar y
   compartir" con estados enviando/ok/error en español.
4. `(client)/_layout.tsx`: tercera `Tabs.Screen` "Exportar".
5. `(client)/dashboard.tsx`: acceso directo que navega a la pestaña con el rango y la
   tipificación actuales como parámetros iniciales.

### Bloque E — Admin-web

1. `src/api/exports.ts`: `downloadExport(authFetch, { format, filters })` → blob +
   `<a download>`, leyendo el nombre de `Content-Disposition` (requiere el
   `exposedHeaders` de D6).
2. `src/api/audit.ts`: hooks TanStack Query (`useAuditLogs` con `useInfiniteQuery`,
   `useAuditFilters`).
3. `AuditoriaPage.tsx`: se **conserva** toda la UI (tabla, pills por acción, fila
   expandible con el diff) y se reemplaza `useStore()` por los hooks reales; se suman
   filtros de entidad y rango de fechas y un "Cargar más" por cursor.
4. Export global: bloque de descarga en `ClientesPage` (o barra propia en la página de
   auditoría/métricas, según dónde calce mejor la navegación) con selector "Todas las
   empresas / una empresa" visible solo para `super_admin`.
5. `main.ts` del API: `exposedHeaders: ['Content-Disposition']`.

### Bloque F — Datos y medición

- `prisma/inflate-reports.ts` + scripts `inflate` / `inflate -- --clean` (D8).
- `scripts/export-memory-check.ts` (D8) y su salida registrada en `PROGRESS.md`.
- Al terminar la medición, `--clean` para dejar la base de desarrollo como estaba
  (el resto de las suites e2e cuenta filas del seed y 50 000 reportes sintéticos las
  volverían lentas, aunque no incorrectas).

### Bloque G — Tests e2e

Dos suites nuevas (quedan 10 en total; `--runInBand` ya configurado):

- `test/exports.e2e-spec.ts`
  - `client_user` de Acme descarga el CSV: **todas** las filas son de Acme, y el
    conteo coincide **exactamente** con `GET /reports/summary` para el mismo filtro
    (criterio 2, contrastado además contra `prisma.forUser(user).callReport.count()`).
  - Mismo filtro con `?tenantId=<globex>` forzado → el archivo no cambia (D7).
  - Filtros `from`/`to`/`dispositionId` → el CSV tiene exactamente las filas que
    devuelve `GET /reports` con esos mismos parámetros.
  - Cabeceras HTTP: `text/csv; charset=utf-8`, `Content-Disposition: attachment`,
    BOM al inicio del cuerpo.
  - Antiinyección: un reporte con notas `=SUM(A1)` sale como `'=SUM(A1)` (D3).
  - Un reporte con notas multilínea y comillas produce **una sola** línea CSV bien
    escapada (parseo de vuelta y comparación campo por campo).
  - PDF: 200, `application/pdf`, el buffer arranca con `%PDF-`, y el tamaño es > 1 KB.
  - `super_admin` sin `tenantId` obtiene filas de ambos tenants y la columna `Empresa`.
- `test/audit-viewer.e2e-spec.ts`
  - `client_user` y `agent` → 403 en `GET /admin/audit-logs`.
  - Supervisor: lista paginada por cursor sin solapamientos ni huecos entre páginas.
  - Filtros por `userId`, `entityType`, `action` y rango, contrastados contra
    `count()` de Prisma.
  - **Se ven eventos de todas las fases anteriores** (criterio 3): la suite crea un
    reporte (Fase 4), lo edita (Fase 4), resuelve un seguimiento (Fase 6) y una
    mutación de admin (Fase 3), y verifica que las 4 aparecen con su `action`.
  - **Inmutabilidad** (criterio 4): con `forUser(supervisor)`, `auditLog.update()` y
    `auditLog.delete()` fallan con error de permisos de Postgres.
  - Regresión de RLS: encender RLS no rompió la escritura — un agente crea un reporte
    y su fila de auditoría existe (si la política de INSERT faltara, esto falla).

---

## 3. Orden de ejecución

```
A (migración audit RLS + verificación SQL a mano)
├─ B (ExportsModule)   ──┐
└─ C (visor de auditoría)─┴─→ G (2 suites e2e verdes, 10 en total)
                              ├─→ D (móvil: pestaña Exportar)
                              ├─→ E (admin-web: auditoría real + export global)
                              └─→ F (inflado a 50k + medición de memoria)
                                   └─→ PROGRESS.md (bitácora Fase 7)
```

Checkpoints donde conviene parar y verificar antes de seguir:
1. Después de **A**: las 4 pruebas SQL a mano contra Neon (D4) — y en particular que
   un `POST /reports` de un agente sigue funcionando (política de INSERT).
2. Apenas se instala `pdfmake`: correr **una** suite e2e para descartar el problema
   ESM/Jest que dio `expo-server-sdk` en la Fase 6 (D5).
3. Después de **G**: `npm run test:e2e` con las 10 suites verdes.
4. Después de **D/E**: `tsc --noEmit` + `expo lint` en móvil; `tsc -b` + `vite build`
   + `oxlint` en admin-web.
5. **F al final**, con la limpieza (`--clean`) incluida en el mismo paso.

---

## 4. Cómo se verifica cada criterio de aceptación

| Criterio de `plan.md` | Cómo se cubre |
|---|---|
| Seed inflado a ~50 000: la descarga CSV completa termina sin que Node supere memoria estable | `scripts/export-memory-check.ts` con consumidor lento (D8): RSS/heap muestreados, sin crecimiento monótono. Salida pegada en `PROGRESS.md` |
| El CSV de un cliente contiene solo filas de su tenant y coincide en conteo con el dashboard | `exports.e2e-spec.ts`: aislamiento + conteo contra `GET /reports/summary` y contra `count()` de Prisma, incluido el caso `?tenantId=` forzado |
| El PDF abre en iPhone y Android vía share sheet y refleja los filtros | **Parcial.** Backend verificado con e2e (`%PDF-`, filtros aplicados) y el share sheet queda para la pasada manual en dispositivo — mismo estado que todos los criterios "en dispositivo físico" de las Fases 1–6 |
| El visor muestra eventos de todas las fases y sigue siendo imposible modificar `audit_logs` | `audit-viewer.e2e-spec.ts`: 4 acciones de fases distintas listadas + `update`/`delete` rechazados por Postgres, más las pruebas SQL a mano de D4 |

---

## 5. Riesgos y deferidos previstos

- **Encender RLS en `audit_logs` toca el camino de escritura de *todo* el sistema**
  (D4): si la política de INSERT quedara mal, cada mutación de cada rol empieza a
  fallar. Por eso el checkpoint 1 incluye un `POST /reports` real, y la suite e2e
  tiene una prueba de regresión explícita.
- **Fuentes estándar del PDF** (D5): riesgo acotado de acentos; verificación
  obligatoria y fallback conocido (Roboto embebido + `assets` en `nest-cli.json`).
- **`pdfmake` y el árbol de módulos de Jest** (D5): precedente directo de la Fase 6
  con `expo-server-sdk`. Mitigado con un checkpoint temprano.
- **Descarga en móvil sin refresh automático de token** (D6): mitigado con el conteo
  previo vía `authFetch` + un reintento manual en 401. Si aparece un caso raro de
  token vencido justo entre ambas llamadas, el usuario ve un error claro y reintenta.
- **El blob completo en el navegador** (D6): 50 000 filas ≈ 10 MB en memoria del
  panel. Aceptable en escritorio; si algún día hay exports mucho más grandes, la
  salida es `showSaveFilePicker` + `WritableStream` (anotado, no implementado).
- **Deuda que NO se toca en esta fase**: `TurnosPage` sigue sobre el mock (necesita el
  clock-out de supervisor, que no tiene endpoint); el diff de auditoría sigue siendo
  superficial (`before: null`, desde Fase 3); CORS del API y del gateway de sockets
  siguen abiertos, ahora con una cabecera expuesta más para revisar en Fase 8; push
  real sigue esperando el `eas init` + development build de Fase 8.
