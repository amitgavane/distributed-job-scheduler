/**
 * Embedded Postgres bootstrap — Athul S (RA2311047010117)
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../.pgdata');
const database = 'codity_scheduler';
const user = 'scheduler';
const password = 'scheduler_secret';
const port = 5432;

async function main() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
  });

  const alreadyInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (!alreadyInit) {
    await pg.initialise();
  }
  await pg.start();

  // create app database if missing
  const { Client } = await import('pg');
  const client = new Client({
    host: 'localhost',
    port,
    user,
    password,
    database: 'postgres',
  });
  await client.connect();
  const exists = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [database]
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${database}`);
    console.log(`created database ${database}`);
  }
  await client.end();

  console.log(`postgres running on localhost:${port} — Athul S (RA2311047010117)`);
  console.log(`DATABASE_URL=postgresql://${user}:${password}@localhost:${port}/${database}`);

  const shutdown = async () => {
    console.log('stopping postgres...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
