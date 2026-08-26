-- Fase 4 (plan.md): dos huecos de RLS que quedaron abiertos en fases
-- anteriores y que bloquean/exponen el flujo del agente.
--
-- 1. No existía ninguna política de UPDATE para 'agent' sobre
--    call_reports. Con FORCE ROW LEVEL SECURITY, un PATCH /reports/:id
--    del propio autor afectaba 0 filas aunque el servicio ya hubiera
--    validado la ventana de edición -- la regla de negocio vive en el
--    servicio (mensaje 403 claro), pero la política sigue siendo
--    necesaria como límite real de la base: sin ella, ningún UPDATE de
--    agente es posible sin importar lo que diga la app.
--
-- 2. campaign_agents.is_active (migración campaign_agents_soft_remove,
--    Fase 3) no lo miraba ninguna política RLS todavía -- "desasignar un
--    agente" desde el panel no tenía efecto real de seguridad: el agente
--    desasignado seguía viendo e insertando en esa campaña. Se agrega
--    "AND is_active" a las cuatro políticas de agente que consultan
--    campaign_agents.
--
-- Mismo contrato de sesión que las migraciones RLS anteriores:
-- current_setting(name, true) + nullif(x, '') -- ver
-- 20260722000001_enable_rls para el detalle completo.

-- ---------------------------------------------------------------------
-- 1. campaigns_agent_select -- respetar is_active.
-- ---------------------------------------------------------------------
DROP POLICY campaigns_agent_select ON campaigns;

CREATE POLICY campaigns_agent_select ON campaigns
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND is_active
    )
  );

-- ---------------------------------------------------------------------
-- 2. dispositions_agent_select -- respetar is_active.
-- ---------------------------------------------------------------------
DROP POLICY dispositions_agent_select ON dispositions;

CREATE POLICY dispositions_agent_select ON dispositions
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND is_active
    )
  );

-- ---------------------------------------------------------------------
-- 3. call_reports_agent_select -- respetar is_active.
-- ---------------------------------------------------------------------
DROP POLICY call_reports_agent_select ON call_reports;

CREATE POLICY call_reports_agent_select ON call_reports
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND is_active
    )
  );

-- ---------------------------------------------------------------------
-- 4. call_reports_agent_insert -- respetar is_active (además del
--    requisito de turno abierto agregado en shifts_rls).
-- ---------------------------------------------------------------------
DROP POLICY call_reports_agent_insert ON call_reports;

CREATE POLICY call_reports_agent_insert ON call_reports
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND is_active
    )
    AND tenant_id = (SELECT tenant_id FROM campaigns WHERE id = call_reports.campaign_id)
    AND shift_id IN (
      SELECT id FROM shifts
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND ended_at IS NULL
    )
  );

-- ---------------------------------------------------------------------
-- 5. call_reports_agent_update -- nueva. Solo permite tocar reportes
--    propios y nunca "mover" un reporte a otro tenant (el chequeo de
--    WITH CHECK repite el join contra campaigns por si algún día se
--    permite reasignar campaign_id, aunque hoy los DTOs de PATCH no lo
--    exponen). La ventana de edición de N minutos (tenants.edit_window_
--    minutes) NO se valida acá -- vive en ReportsService para poder
--    devolver un 403 con mensaje en vez de un UPDATE silencioso de 0
--    filas.
-- ---------------------------------------------------------------------
CREATE POLICY call_reports_agent_update ON call_reports
  FOR UPDATE TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND agent_id = nullif(current_setting('app.user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND agent_id = nullif(current_setting('app.user_id', true), '')
    AND tenant_id = (SELECT tenant_id FROM campaigns WHERE id = call_reports.campaign_id)
  );
