import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Offline validation needs no URL; migration commands require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
