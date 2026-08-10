/**
 * M1 Apply-layer REHEARSAL on embedded PostgreSQL.
 * Does NOT grant PRODUCTION CANARY READY.
 *
 * Usage:
 *   npx tsx scripts/run-m1-rehearsal-embedded.ts
 *   npm run m1:rehearsal-embedded
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from 'net';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

async function main() {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const port = await freePort();
  const databaseDir = mkdtempSync(join(tmpdir(), 'uwc-m1-rehearsal-'));
  const password = 'm1_rehearsal_pw';
  const user = 'postgres';

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: false,
  });

  console.log(`[m1-rehearsal] init embedded PG port=${port}`);
  await pg.initialise();
  await pg.start();

  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`;
  const client = pg.getPgClient();
  await client.connect();
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE "ItemType" AS ENUM ('ACTIVITY','REST','MEAL_ANCHOR','MEAL_FLOATING','TRANSIT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS "Trip" (
      id TEXT PRIMARY KEY,
      destination TEXT NOT NULL,
      "startDate" TIMESTAMPTZ NOT NULL,
      "endDate" TIMESTAMPTZ NOT NULL,
      "budgetConfig" JSONB,
      "pacingConfig" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL,
      metadata JSONB,
      status TEXT DEFAULT 'PLANNING',
      name VARCHAR(200)
    );
    CREATE TABLE IF NOT EXISTS "TripDay" (
      id TEXT PRIMARY KEY,
      "tripId" TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
      date TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "ItineraryItem" (
      id TEXT PRIMARY KEY,
      "startTime" TIMESTAMPTZ,
      "endTime" TIMESTAMPTZ,
      type "ItemType" NOT NULL,
      "placeId" INT,
      "tripDayId" TEXT NOT NULL REFERENCES "TripDay"(id) ON DELETE CASCADE,
      note TEXT,
      "trailId" INT,
      "actualCost" DOUBLE PRECISION,
      "costCategory" TEXT,
      "costNote" TEXT,
      currency TEXT DEFAULT 'CNY',
      "estimatedCost" DOUBLE PRECISION,
      "isPaid" BOOLEAN NOT NULL DEFAULT FALSE,
      "paidBy" TEXT,
      "bookedAt" TIMESTAMPTZ,
      "bookingConfirmation" TEXT,
      "bookingStatus" TEXT,
      "bookingUrl" TEXT,
      "travelFromPreviousDistance" INT,
      "travelFromPreviousDuration" INT,
      "travelMode" TEXT,
      "order" INT,
      product_offering_id VARCHAR(64),
      product_session_id VARCHAR(64),
      experience_definition_id VARCHAR(64)
    );
  `);
  await client.end();

  console.log('[m1-rehearsal] schema ready — running Apply-layer suite');
  const result = spawnSync(
    'npx',
    ['tsx', 'scripts/run-m1-rehearsal-embedded-inner.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONFIRM_MULTI_INSTANCE_LIVE: '1',
        CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL: url,
        M1_STAGING_DATABASE_URL: url,
        DATABASE_URL: url,
      },
      stdio: 'inherit',
    },
  );

  console.log('[m1-rehearsal] stopping embedded PG');
  await pg.stop();
  try {
    rmSync(databaseDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
