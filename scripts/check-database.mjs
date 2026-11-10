import { spawnSync } from 'node:child_process';
import { testDatabaseConfig } from '../tests/support/database.js';
const config = testDatabaseConfig();
const result = spawnSync(process.execPath, [
  'node_modules/prisma/build/index.js', 'migrate', 'diff',
  '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code',
], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: config.databaseUrl } });
process.exit(result.status ?? 1);
