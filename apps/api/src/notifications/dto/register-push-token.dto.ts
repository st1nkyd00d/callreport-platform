import { IsIn, IsString, Validate } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { isExpoPushToken } from '../push-token-format';

@ValidatorConstraint({ name: 'isExpoPushToken', async: false })
class IsExpoPushTokenConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isExpoPushToken(value);
  }
  defaultMessage(): string {
    return 'token no tiene el formato de un Expo push token';
  }
}

export class RegisterPushTokenDto {
  @IsString()
  @Validate(IsExpoPushTokenConstraint)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}
