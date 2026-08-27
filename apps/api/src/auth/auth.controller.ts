import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

// Fase 8 (D1): límite estricto propio para login/refresh, más bajo que el
// 'default' global (ThrottlerModule en app.module.ts) -- son los únicos
// endpoints @Public(), el blanco natural de fuerza bruta. Los valores se
// leen de process.env directamente (no ConfigService): @Throttle() es un
// decorador, se evalúa al IMPORTAR este archivo -- antes de que exista
// cualquier instancia de Nest/ConfigService -- así que necesita que
// process.env ya esté poblado en ese momento. main.ts importa
// 'dotenv/config' como su primerísima línea para garantizar el orden
// (mismo tipo de trampa que el CORS del gateway de sockets, D2).
const AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 10),
    ttl: Number(process.env.THROTTLE_AUTH_TTL ?? 60) * 1000,
  },
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto);
  }
}
