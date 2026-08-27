-- Fase 7 (plan.md / plan-fase-7.md D4): audit_logs queda fuera de RLS
-- desde 20260722000001_enable_rls a propósito ("no es multi-tenant en
-- sí misma"), pero SÍ es cross-tenant -- contiene acciones, IPs y diffs
-- de bodies de TODOS los tenants. Mientras nadie la leyera no importaba;
-- el visor de auditoría de esta fase la lee, así que el corte real tiene
-- que vivir acá, no solo en el @Roles(supervisor, super_admin) del
-- controller. Mismo contrato de sesión que el resto de las políticas
-- (ver 20260722000001_enable_rls para el detalle completo).

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Solo staff puede LEER auditoría -- ningún client_user ni agent ve esta
-- tabla, ni siquiera sus propias filas.
CREATE POLICY audit_logs_staff_select ON audit_logs
  FOR SELECT TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

-- Imprescindible: AuditInterceptor escribe con forUser(user) para
-- CUALQUIER rol autenticado (un agente creando un reporte, un
-- client_user resolviendo un seguimiento, etc. -- ver audit.interceptor.ts).
-- Sin esta política, encender FORCE ROW LEVEL SECURITY bloquearía el
-- INSERT de auditoría de cada mutación del sistema, no solo la lectura.
-- Cada sesión únicamente puede insertar SU PROPIA fila (user_id =
-- app.user_id) -- nadie puede falsificar auditoría a nombre de otro.
CREATE POLICY audit_logs_self_insert ON audit_logs
  FOR INSERT TO app_user
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

-- Sin políticas de UPDATE/DELETE (a propósito: inmutabilidad real). El
-- REVOKE UPDATE, DELETE ON audit_logs FROM app_user de
-- 20260722000001_enable_rls sigue vigente -- doble cierre, ni GRANT ni
-- política lo permiten.
