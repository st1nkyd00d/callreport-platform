import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  editWindowMinutes?: number;
}
