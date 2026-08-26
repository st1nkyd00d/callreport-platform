import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, ValidateIf } from 'class-validator';
import { Role } from '../../../generated/prisma/enums';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  // Solo se usa (y se exige) cuando role === client_user -- crea el
  // tenant_membership correspondiente (ver UsersService.create).
  @ValidateIf((o: CreateUserDto) => o.role === Role.client_user)
  @IsString()
  @IsNotEmpty()
  tenantId?: string;
}
