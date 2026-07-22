-- apps/api/prisma/init/01-roles.sql
--
-- Se ejecuta UNA sola vez: automáticamente, la primera vez que el
-- contenedor de postgres inicializa un volumen de datos VACÍO
-- (convención docker-entrypoint-initdb.d; los archivos se ejecutan en
-- orden alfabético). Corre como el superusuario POSTGRES_USER definido
-- en docker-compose.yml.
--
-- GOTCHA OPERATIVO: si ya existe un volumen `postgres_data` de un
-- `docker compose up` previo (p.ej. de antes de agregar este archivo),
-- este script NO se ejecuta automáticamente -- los scripts de init solo
-- corren contra un volumen nuevo. Si aparece "role app_user does not
-- exist", hace falta `docker compose down -v` una vez para recrear el
-- volumen, o correr este archivo a mano vía psql.
--
-- Crea los dos roles no-superusuario de los que depende el resto de la
-- Fase 1:
--   migrator  -> dueño del schema/tablas. Usado SOLO por `prisma migrate`
--                y `prisma db seed`. Tiene BYPASSRLS para que las
--                migraciones/seeds nunca queden bloqueadas por las
--                políticas de FORCE ROW LEVEL SECURITY agregadas después
--                (ver la migración enable_rls) -- FORCE RLS aplica
--                incluso al rol dueño, así que sin BYPASSRLS
--                `prisma db seed` no podría insertar sus propias filas.
--   app_user  -> el rol con el que se conecta NestJS en runtime (Fase 2
--                en adelante). Rol ordinario, totalmente sujeto a RLS.
--                NUNCA otorgar BYPASSRLS ni SUPERUSER a este rol -- eso
--                anula silenciosamente todas las políticas RLS del
--                sistema.
--
-- Credenciales de solo desarrollo, reflejadas en apps/api/.env.example.
-- Rotar antes de cualquier despliegue no-local.

CREATE ROLE migrator WITH LOGIN PASSWORD 'migrator_dev_pw' CREATEDB BYPASSRLS;
CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_pw';

-- migrator es dueño del schema, así `prisma migrate` puede crear/alterar
-- tablas libremente sin grants por objeto. CREATEDB permite que
-- `prisma migrate dev` (flujo local de autoría) cree su base de datos
-- shadow; no hace falta para `prisma migrate deploy` solo, pero es
-- inofensivo en este contenedor de solo desarrollo.
ALTER SCHEMA public OWNER TO migrator;

GRANT CONNECT ON DATABASE callreport TO migrator, app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Cada tabla que migrator cree de aquí en adelante otorga
-- automáticamente a app_user SELECT/INSERT/UPDATE. Sin DELETE global: la
-- aplicación nunca borra filas físicamente (usa flags de estado en su
-- lugar). Esto aplica retroactivamente a cada futuro
-- `prisma migrate deploy`, incluyendo el primero que crea todas las
-- tablas de la Fase 1.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_user;

-- Defensa en profundidad (PG15+ ya quita esto de PUBLIC por defecto).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
