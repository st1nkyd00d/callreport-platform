-- Row-Level Security multi-tenant — ver plan.md Fase 1, tarea 6.
--
-- Contrato de sesión que NestJS establece en cada transacción de Prisma
-- (PrismaService.forUser(), se construye en Fase 2):
--   SELECT set_config('app.user_id',   $1, true);
--   SELECT set_config('app.role',      $2, true);
--   SELECT set_config('app.tenant_id', $3, true);  -- sin valor para staff
-- El tercer argumento `true` hace que el setting sea transaction-scoped,
-- seguro con connection pooling (pgbouncer en modo transaction, etc.).
--
-- current_setting(name, true) devuelve NULL si el GUC nunca fue seteado
-- en la sesión. nullif(x, '') trata además un string vacío explícito como
-- no-seteado. Ambos casos terminan en una comparación contra NULL::uuid,
-- que siempre es falsa en USING/WITH CHECK — así se logra el criterio de
-- aceptación "sin settings seteados -> cero filas".
--
-- Todos los roles de aplicación (super_admin/supervisor/agent/client_user)
-- se conectan con el mismo rol de Postgres `app_user`; la diferenciación
-- de rol es puramente a nivel de sesión (GUC), por eso cada política
-- evalúa 'app.role' explícitamente en vez de depender de roles de
-- Postgres distintos.

-- ---------------------------------------------------------------------
-- 1. Enable + FORCE RLS en las cuatro tablas con datos multi-tenant.
--    FORCE es necesario para que hasta el dueño de la tabla (migrator)
--    quede sujeto a las políticas -- por eso migrator tiene BYPASSRLS
--    (ver prisma/init/01-roles.sql), si no `prisma db seed` quedaría
--    bloqueado por sus propios INSERTs.
-- ---------------------------------------------------------------------
ALTER TABLE call_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_reports       FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns          FORCE ROW LEVEL SECURITY;
ALTER TABLE dispositions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispositions       FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. campaigns
-- ---------------------------------------------------------------------
CREATE POLICY campaigns_staff_all ON campaigns
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

CREATE POLICY campaigns_client_select ON campaigns
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'client_user'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY campaigns_agent_select ON campaigns
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

-- ---------------------------------------------------------------------
-- 3. dispositions (sin columna tenant_id propia -> se filtra vía join
--    contra campaigns)
-- ---------------------------------------------------------------------
CREATE POLICY dispositions_staff_all ON dispositions
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

CREATE POLICY dispositions_client_select ON dispositions
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'client_user'
    AND campaign_id IN (
      SELECT id FROM campaigns
      WHERE tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

CREATE POLICY dispositions_agent_select ON dispositions
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

-- ---------------------------------------------------------------------
-- 4. tenant_memberships
-- ---------------------------------------------------------------------
CREATE POLICY tenant_memberships_staff_all ON tenant_memberships
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

CREATE POLICY tenant_memberships_client_select ON tenant_memberships
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'client_user'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------
-- 5. call_reports — tabla de mayor riesgo. El INSERT del agente valida
--    el tenant_id REAL de la campaña (join contra campaigns), no solo la
--    membresía en campaign_agents -- si no, un cliente malicioso o un
--    bug podría enviar un reporte con un tenant_id distinto al de la
--    campaña real.
-- ---------------------------------------------------------------------
CREATE POLICY call_reports_staff_all ON call_reports
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

CREATE POLICY call_reports_client_select ON call_reports
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'client_user'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY call_reports_agent_select ON call_reports
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

CREATE POLICY call_reports_agent_insert ON call_reports
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
    AND tenant_id = (SELECT tenant_id FROM campaigns WHERE id = call_reports.campaign_id)
  );

-- ---------------------------------------------------------------------
-- 6. audit_logs — inmutabilidad. No necesita RLS (no es multi-tenant en
--    sí misma, el visor de auditoría de Fase 7 la filtra por columnas),
--    solo endurecimiento de GRANTs. UPDATE fue otorgado globalmente por
--    ALTER DEFAULT PRIVILEGES en 01-roles.sql; se revoca aquí
--    específicamente. DELETE nunca fue otorgado (ALTER DEFAULT
--    PRIVILEGES solo cubrió SELECT/INSERT/UPDATE); se revoca de todas
--    formas para dejar explícita la intención de inmutabilidad.
-- ---------------------------------------------------------------------
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
