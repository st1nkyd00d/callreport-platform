-- Turnos de agente (clock in/out) y tipificaciones extendidas.
-- Ver plan.md raíz para el contexto de producto; esta migración solo cubre
-- el esquema. Las políticas RLS de "shifts" y el endurecimiento de
-- call_reports_agent_insert (exigir turno abierto) van en la migración
-- siguiente, 20260823000001_shifts_rls.

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- AlterTable: call_reports gana el enlace al turno del agente, la fecha de
-- cita agendada (tipificación "Cita Agendada") y el detalle obligatorio de
-- la tipificación "Otro".
ALTER TABLE "call_reports"
    ADD COLUMN "shift_id" TEXT,
    ADD COLUMN "scheduled_at" TIMESTAMP(3),
    ADD COLUMN "detail_text" TEXT;

-- AlterTable: dispositions gana un slug estable (code) para que el
-- frontend deje de derivar íconos/colores/métricas comparando la etiqueta
-- en español, más los flags de captura condicional del formulario.
ALTER TABLE "dispositions"
    ADD COLUMN "code" TEXT,
    ADD COLUMN "requires_detail" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "requires_schedule" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "color" TEXT,
    ADD COLUMN "icon" TEXT;

-- Backfill de code/color/icon para las 4 tipificaciones default sembradas
-- en Fase 1 (única vez que comparar por label es correcto: es una
-- migración de datos puntual, no lógica de aplicación).
UPDATE "dispositions" SET "code" = 'venta', "color" = 'success', "icon" = 'check_circle'
    WHERE "label" = 'Venta Completada';
UPDATE "dispositions" SET "code" = 'consulta', "color" = 'primary', "icon" = 'support_agent'
    WHERE "label" = 'Consulta Resuelta';
UPDATE "dispositions" SET "code" = 'seguimiento', "color" = 'warning', "icon" = 'schedule'
    WHERE "label" = 'Seguimiento Pendiente';
UPDATE "dispositions" SET "code" = 'no_interesado', "color" = 'neutral', "icon" = 'do_not_disturb'
    WHERE "label" = 'No Interesado';

-- CreateIndex
CREATE INDEX "shifts_user_id_started_at_idx" ON "shifts"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "shifts_started_at_idx" ON "shifts"("started_at");

-- Un solo turno abierto por usuario -- hace imposible el doble clock-in
-- incluso ante una condición de carrera en el API (índice único parcial,
-- Prisma no puede expresar esto declarativamente).
CREATE UNIQUE INDEX "shifts_one_open_per_user" ON "shifts"("user_id") WHERE "ended_at" IS NULL;

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_ended_after_started"
    CHECK ("ended_at" IS NULL OR "ended_at" > "started_at");

-- CreateIndex
CREATE INDEX "call_reports_tenant_id_scheduled_at_idx" ON "call_reports"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "dispositions_campaign_id_code_key" ON "dispositions"("campaign_id", "code");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_reports" ADD CONSTRAINT "call_reports_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nota: los GRANT SELECT/INSERT/UPDATE a app_user sobre "shifts" son
-- automáticos vía ALTER DEFAULT PRIVILEGES (prisma/init/01-roles.sql:53-54).
-- No hace falta GRANT explícito aquí. DELETE nunca se otorga: clock-out es
-- un UPDATE de ended_at, nunca un borrado de fila.
