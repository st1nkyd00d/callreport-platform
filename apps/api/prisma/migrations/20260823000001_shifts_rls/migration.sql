-- RLS de la tabla "shifts" + endurecimiento de call_reports_agent_insert
-- para exigir un turno abierto propio. Mismo contrato de sesión que
-- 20260722000001_enable_rls (ver ese archivo para el detalle del contrato
-- app.user_id / app.role / app.tenant_id): current_setting(name, true) +
-- nullif(x, '') para que "sin settings seteados -> cero filas".

-- ---------------------------------------------------------------------
-- 1. shifts -- turno del call center, NO lleva tenant_id (un turno es
--    laboral interno, no pertenece a una empresa cliente). Los
--    client_user no tienen ninguna política aquí: no ven turnos.
-- ---------------------------------------------------------------------
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;

-- staff ve y administra todos los turnos (incluye cerrar turnos olvidados
-- desde el panel, sellando closed_by).
CREATE POLICY shifts_staff_all ON shifts
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

-- el agente solo ve sus propios turnos.
CREATE POLICY shifts_agent_select ON shifts
  FOR SELECT TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND user_id = nullif(current_setting('app.user_id', true), '')
  );

-- el agente solo puede abrir turnos a su propio nombre (clock-in). El
-- índice único parcial shifts_one_open_per_user (ver migración anterior)
-- impide un segundo turno abierto simultáneo incluso si esta política
-- se evaluara dos veces en paralelo.
CREATE POLICY shifts_agent_insert ON shifts
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND user_id = nullif(current_setting('app.user_id', true), '')
  );

-- el agente solo puede cerrar (UPDATE de ended_at) sus propios turnos --
-- clock-out nunca es un DELETE.
CREATE POLICY shifts_agent_update ON shifts
  FOR UPDATE TO app_user
  USING (
    current_setting('app.role', true) = 'agent'
    AND user_id = nullif(current_setting('app.user_id', true), '')
  )
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND user_id = nullif(current_setting('app.user_id', true), '')
  );

-- ---------------------------------------------------------------------
-- 2. call_reports_agent_insert -- se reemplaza para exigir que el reporte
--    cuelgue de un turno ABIERTO del propio agente. Así "no se puede
--    reportar sin turno" es una garantía de base de datos, no solo de UI.
-- ---------------------------------------------------------------------
DROP POLICY call_reports_agent_insert ON call_reports;

CREATE POLICY call_reports_agent_insert ON call_reports
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    AND campaign_id IN (
      SELECT campaign_id FROM campaign_agents
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
    )
    AND tenant_id = (SELECT tenant_id FROM campaigns WHERE id = call_reports.campaign_id)
    AND shift_id IN (
      SELECT id FROM shifts
      WHERE user_id = nullif(current_setting('app.user_id', true), '')
        AND ended_at IS NULL
    )
  );
