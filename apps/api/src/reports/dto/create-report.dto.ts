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

// tenantId, agentId y shiftId NO están acá a propósito (plan.md Fase 4):
// el ValidationPipe global (whitelist + forbidNonWhitelisted) rechaza con
// 400 cualquier intento de inyectarlos desde el cliente. Los tres se
// derivan en ReportsService.create() a partir de la campaña, el usuario
// autenticado y el turno abierto.
export class CreateReportDto {
  @IsString()
  @MinLength(1)
  campaignId!: string;

  @IsString()
  @MinLength(1)
  dispositionId!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  @MinLength(1)
  contactPhone!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeNotes(value))
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  detailText?: string;
}
