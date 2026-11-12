import { createServer } from 'node:http';
import { createRealtime } from './realtime/index.js';
import { createApp } from './app.js';
import { loadConfig } from './configs/env.js';
import { createDatabase } from './configs/database.js';

let db;
try {
  const config = loadConfig();
  db = createDatabase(config);
  await db.$connect();
  const events={},server=createServer(createApp({db,config,events})),realtime=createRealtime(server,{db,config});Object.assign(events,realtime);
  server.listen(config.port, config.host, () => {
    console.log(`Server listening on port ${config.port}`);
  });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    await realtime.close();
    const finish=async error=>{
      try { await db.$disconnect(); }
      catch { process.exitCode = 1; }
      if (error&&error.code!=='ERR_SERVER_NOT_RUNNING') process.exitCode = 1;
      clearTimeout(deadline);
    };
    if(server.listening){server.close(finish);server.closeIdleConnections();}else await finish();
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
  server.once('error', async () => {
    console.error('Server listener failed');
    process.exitCode = 1;
    await db.$disconnect();
  });
} catch {
  console.error('Server startup failed; check configuration and database availability');
  process.exitCode = 1;
  if (db) await db.$disconnect();
}
