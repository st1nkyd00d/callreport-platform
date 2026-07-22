import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Rol `migrator`: dueño del schema, BYPASSRLS (ver prisma/init/01-roles.sql).
    // El rol `app_user` (sujeto a RLS) se usa en runtime desde NestJS, no aquí.
    url: env('DATABASE_URL'),
  },
});
