-- Fase 6 (plan.md): dos huecos de RLS descubiertos al planificar push +
-- cola de seguimientos, mismo patrón que las migraciones RLS anteriores
-- (current_setting(name, true) + nullif(x, '') -- ver
-- 20260722000001_enable_rls para el contrato de sesión completo).

-- ---------------------------------------------------------------------
-- 1. push_tokens: revoked_at (baja lógica -- app_user nunca tiene GRANT
--    DELETE, ver 01-roles.sql) + la tabla no tenía RLS todavía (Fase 1
--    la creó sin política: cualquier rol podía leer los tokens de
--    cualquier usuario). Se cierra acá porque recién ahora hay un
--    consumidor real (NotificationsModule).
-- ---------------------------------------------------------------------
ALTER TABLE "push_tokens" ADD COLUMN     "revoked_at" TIMESTAMP(3);

-- Un usuario puede tener a lo sumo un token activo por dispositivo, pero
-- reinstalar la app puede generar un token Expo nuevo para el mismo
-- dispositivo -- no hay unicidad por (user_id) acá, solo por token (ya
-- está en el schema). El índice parcial acelera "tokens activos de este
-- usuario", que es la consulta que hace NotificationsService en cada envío.
CREATE INDEX "push_tokens_user_id_active_idx" ON "push_tokens" ("user_id") WHERE "revoked_at" IS NULL;

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE ROW LEVEL SECURITY;

-- Cada usuario administra sus propios tokens (registrar/dar de baja
-- desde su propio dispositivo). No hace falta separar SELECT de
-- INSERT/UPDATE: nunca hay un caso de negocio donde un usuario deba
-- tocar el token de otro.
CREATE POLICY push_tokens_self_all ON push_tokens
  FOR ALL TO app_user
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

-- staff (targeting de push vía PrismaService.forSystem(), que reutiliza
-- estas mismas políticas *_staff_all fijando app.role='super_admin') y
-- el propio NotificationsService al momento de dar de baja tokens
-- inválidos tras procesar receipts de Expo (DeviceNotRegistered).
CREATE POLICY push_tokens_staff_all ON push_tokens
  FOR ALL TO app_user
  USING (current_setting('app.role', true) IN ('supervisor', 'super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('supervisor', 'super_admin'));

-- ---------------------------------------------------------------------
-- 2. call_reports -- resolución de seguimientos por el client_user.
--    No existía ninguna política de UPDATE para este rol (mismo hueco
--    que ya se había encontrado para 'agent' en agent_report_edit_rls,
--    Fase 4): sin esto, POST /followups/:id/resolve actualizaría 0 filas
--    en silencio con FORCE ROW LEVEL SECURITY encendido.
-- ---------------------------------------------------------------------
CREATE POLICY call_reports_client_update ON call_reports
  FOR UPDATE TO app_user
  USING (
    current_setting('app.role', true) = 'client_user'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.role', true) = 'client_user'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')
  );

-- Una política RLS es todo-o-nada por FILA, no puede limitar qué
-- COLUMNAS se tocan. Sin este trigger, call_reports_client_update de
-- arriba dejaría a cualquier client_user reescribir notas/contacto/
-- tipificación de cualquier reporte de su tenant si algún día aparece
-- otro endpoint de UPDATE que un client_user pueda alcanzar. El límite
-- real vive acá, no solo en que FollowupsService únicamente setee esas
-- dos columnas.
CREATE FUNCTION enforce_client_followup_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.role', true) = 'client_user' THEN
    IF to_jsonb(NEW) - '{followup_resolved_at,followup_resolved_by,updated_at}'::text[]
       IS DISTINCT FROM
       to_jsonb(OLD) - '{followup_resolved_at,followup_resolved_by,updated_at}'::text[]
    THEN
      RAISE EXCEPTION 'client_user solo puede resolver seguimientos (followup_resolved_at/by)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_reports_client_update_columns
  BEFORE UPDATE ON call_reports
  FOR EACH ROW
  EXECUTE FUNCTION enforce_client_followup_only();
