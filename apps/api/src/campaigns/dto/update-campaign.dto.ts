import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CampaignStatus } from '../../../generated/prisma/enums';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}
