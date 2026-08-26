import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizePhone, sanitizeNotes } from '../../common/sanitize';

// campaignId y tenantId no son editables (plan.md Fase 4): ni siquiera
// aparecen acá, así que el ValidationPipe global los rechaza con 400 si
// alguien los manda. dispositionId sí se puede cambiar, pero
// ReportsService.update() revalida que pertenezca a la misma campaña del
// reporte, igual que en la creación.
export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  @MinLength(1)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeNotes(value))
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  dispositionId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  detailText?: string;
}
