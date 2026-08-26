import { IsArray, IsString } from 'class-validator';

export class SetCampaignAgentsDto {
  @IsArray()
  @IsString({ each: true })
  agentIds!: string[];
}
