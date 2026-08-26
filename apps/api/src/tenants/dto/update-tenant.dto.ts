import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { TenantStatus } from '../../../generated/prisma/enums';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  editWindowMinutes?: number;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
