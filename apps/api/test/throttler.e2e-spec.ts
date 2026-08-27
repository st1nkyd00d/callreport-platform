import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
// import type (no `import { AppModule }` estático): @Module({ imports: [
// ConfigModule.forRoot({ validate: validateEnv }), ... ] }) corre
// validate() de forma SÍNCRONA en el momento en que se importa
// app.module.ts -- no cuando se llama a Test.createTestingModule().
// Un import estático se resolvería (junto con toda la cadena
// app.module -> ... -> ConfigModule.forRoot()) ANTES de que corra
// cualquier código propio de este archivo, `beforeAll` incluido (los
// imports de TS se compilan a `require()` en la parte de arriba del
// archivo, sin importar dónde se escriban en el código fuente). Eso
// congelaría THROTTLE_ENABLED en 'false' (el valor que pone
// package.json#test:e2e para las otras 10 suites) antes de que este test
// pudiera mutarlo. `import type` se borra por completo en la compilación
// (cero `require()`); el `import()` dinámico de abajo, en cambio, corre
// en el momento real de la ejecución -- después de mutar process.env.
import type { AppModule as AppModuleType } from '../src/app.module';

// Fase 8 (D1): cubre el criterio de aceptación "fuerza bruta a
// /auth/login bloqueada tras N intentos" con un test automático en vez de
// una prueba manual. Levanta su PROPIA instancia de Nest con
// THROTTLE_ENABLED=true -- las otras 10 suites corren con
// THROTTLE_ENABLED=false (ver package.json#test:e2e) porque hacen ~35
// logins reales en serie y un límite real las rompería.
//
// THROTTLE_ENABLED se lee vía ConfigService dentro de un useFactory
// (app.module.ts), que se re-evalúa cada vez que se compila un módulo de
// test nuevo -- mutar process.env acá ANTES de compilar esta app no afecta
// a los módulos ya compilados por otras suites. THROTTLE_AUTH_LIMIT/TTL,
// en cambio, se leen en auth.controller.ts vía @Throttle() -- un
// decorador, evaluado una sola vez al importar el archivo (primera vez
// que algún spec requiere AppModule) -- así que esta suite no puede
// cambiar esos dos valores en runtime; usa los que ya quedaron fijados
// (10 intentos / 60s por defecto, ver .env.example).
describe('Rate limiting en /auth/* (e2e)', () => {
  let app: INestApplication<App>;
  const originalThrottleEnabled = process.env.THROTTLE_ENABLED;

  beforeAll(async () => {
    process.env.THROTTLE_ENABLED = 'true';

    const { AppModule }: { AppModule: typeof AppModuleType } =
      await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalThrottleEnabled === undefined) {
      delete process.env.THROTTLE_ENABLED;
    } else {
      process.env.THROTTLE_ENABLED = originalThrottleEnabled;
    }
  });

  it('bloquea POST /auth/login con 429 tras superar el límite de intentos', async () => {
    const attempts = 15; // por encima de THROTTLE_AUTH_LIMIT (default 10)
    const statuses: number[] = [];

    for (let i = 0; i < attempts; i++) {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'client1@acmecorp.demo',
        password: 'password-incorrecta',
      });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
    // Todo lo anterior al límite es 401 (credenciales inválidas, no 429) --
    // confirma que el bloqueo es por volumen, no un error de la request.
    const firstThrottledIndex = statuses.indexOf(429);
    expect(firstThrottledIndex).toBeGreaterThan(0);
    expect(statuses.slice(0, firstThrottledIndex)).not.toContain(429);
  });

  it('el cuerpo del 429 sigue el formato consistente del filtro global', async () => {
    let res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'client1@acmecorp.demo', password: 'x' });
    for (let i = 0; i < 20 && res.status !== 429; i++) {
      res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'client1@acmecorp.demo', password: 'x' });
    }
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});
