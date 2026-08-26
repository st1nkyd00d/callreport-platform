-- AuthService necesita resolver el tenant_id de un client_user durante
-- login/refresh (payload del JWT, plan.md Fase 2 tarea 1), ANTES de que
-- exista un tenant_id conocido en la sesión -- es precisamente lo que se
-- está averiguando. La política tenant_memberships_client_select (ver
-- 20260722000001_enable_rls) exige tenant_id = app.tenant_id, así que no
-- sirve para este caso: sin tenant_id todavía, esa condición nunca es
-- verdadera y el lookup siempre devuelve cero filas.
--
-- Esta política adicional (permissive, se combina con OR sobre las
-- existentes) permite que cualquier sesión vea sus PROPIAS filas de
-- membership por user_id, sin importar el rol ni el tenant_id seteados.
-- No es una fuga: un usuario averiguando a qué tenant(s) pertenece él
-- mismo no cruza el aislamiento entre tenants.
CREATE POLICY tenant_memberships_self_select ON tenant_memberships
  FOR SELECT TO app_user
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')
  );
