import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

// JwtModule propio (igual que AuthModule en auth.module.ts): AuthModule
// no exporta JwtService, y este gateway solo necesita verificar, no
// firmar -- registrarlo acá evita acoplar RealtimeModule a AuthModule.
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
