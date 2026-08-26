import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDispositionDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsBoolean()
  requiresFollowup?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDetail?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSchedule?: boolean;
}
