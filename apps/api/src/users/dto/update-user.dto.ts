import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserStatus } from '../../../generated/prisma/enums';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
