import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca una ruta como accesible sin JWT (solo /auth/login y /auth/refresh
// -- ver JwtAuthGuard, que es global vía APP_GUARD).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
