/**
 * M1 local Staging: shared embedded PG + dual app processes + RR LB.
 * Redis optional on local (`M1_LOCAL_SKIP_REDIS=1`) — Apply/OCC/idem still on shared PG.
 *
 * Usage:
 *   npm run m1:local-staging
 */
import { createServer } from 'http';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer as createNetServer } from 'net';
import {
  runM101ConcurrentSameKey,
  runM102CrashAfterLock,
  runM103LostResponseRetry,
  runM104StaleRevision,
  runM105SameItemTwoConfirms,
  writeM1EvidencePacket,
  type M1CaseResult,
} from '../src/decision-runtime/execution/authoritative-write/m1-staging-canary.harness';
import { createConfirmLivePrisma } from '../src/decision-runtime/execution/authoritative-write/confirm-multi-instance-live.harness';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
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

async function ensureSchema(url: string): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
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
}

function startRrLb(listenPort: number, backends: string[]) {
  let i = 0;
  const server = createServer(async (req, res) => {
    const target = backends[i % backends.length]!;
    i += 1;
    const url = `${target}${req.url ?? '/'}`;
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks);
      const upstream = await fetch(url, {
        method: req.method,
        headers: {
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
        body: body.length ? body : undefined,
      });
      const text = await upstream.text();
      const inst = upstream.headers.get('x-app-instance-id');
      if (inst) res.setHeader('X-App-Instance-Id', inst);
      res.setHeader('X-M1-Lb-Backend', target);
      res.statusCode = upstream.status;
      res.end(text);
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  server.listen(listenPort, '127.0.0.1');
  return server;
}

function spawnInstance(opts: {
  port: number;
  instanceId: string;
  databaseUrl: string;
  workerPath: string;
}): ChildProcess {
  return spawn(process.execPath, ['--import', 'tsx', opts.workerPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(opts.port),
      APP_INSTANCE_ID: opts.instanceId,
      DATABASE_URL: opts.databaseUrl,
      M1_STAGING_DATABASE_URL: opts.databaseUrl,
      CONFIRM_MULTI_INSTANCE_LIVE: '1',
      CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL: opts.databaseUrl,
      M1_TOPOLOGY: 'local',
      M1_LOCAL_SKIP_REDIS: '1',
      UWC_1E_SESSION_REDIS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitHealth(url: string, ms = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`health timeout: ${url}`);
}

async function main() {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const pgPort = await freePort();
  const databaseDir = mkdtempSync(join(tmpdir(), 'uwc-m1-local-'));
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'm1_local_pw',
    port: pgPort,
    persistent: false,
  });
  console.log(`[m1-local] starting embedded PG :${pgPort}`);
  await pg.initialise();
  await pg.start();
  const databaseUrl = `postgresql://postgres:m1_local_pw@127.0.0.1:${pgPort}/postgres`;
  await ensureSchema(databaseUrl);

  const workerPath = join(process.cwd(), 'scripts/m1-local-instance-worker.ts');
  const portA = await freePort();
  const portB = await freePort();
  const portLb = await freePort();

  const childA = spawnInstance({
    port: portA,
    instanceId: 'local-a',
    databaseUrl,
    workerPath,
  });
  const childB = spawnInstance({
    port: portB,
    instanceId: 'local-b',
    databaseUrl,
    workerPath,
  });
  for (const [name, c] of [
    ['A', childA],
    ['B', childB],
  ] as const) {
    c.stdout?.on('data', (d) => process.stdout.write(`[inst-${name}] ${d}`));
    c.stderr?.on('data', (d) => process.stderr.write(`[inst-${name}] ${d}`));
  }

  const baseA = `http://127.0.0.1:${portA}`;
  const baseB = `http://127.0.0.1:${portB}`;
  await waitHealth(`${baseA}/health`);
  await waitHealth(`${baseB}/health`);
  console.log(`[m1-local] instances A=${portA} B=${portB}`);

  const lb = startRrLb(portLb, [baseA, baseB]);
  console.log(`[m1-local] LB :${portLb}`);

  process.env.M1_TOPOLOGY = 'local';
  process.env.M1_LOCAL_SKIP_REDIS = '1';
  process.env.M1_STAGING_DATABASE_URL = databaseUrl;
  process.env.CONFIRM_MULTI_INSTANCE_LIVE = '1';
  process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
  process.env.UWC_1E_SESSION_REDIS = '0';
  process.env.M1_INSTANCE_A_BASE_URL = `${baseA}/api`;
  process.env.M1_INSTANCE_B_BASE_URL = `${baseB}/api`;
  process.env.M1_LB_BASE_URL = `http://127.0.0.1:${portLb}/api`;

  const prismaA = createConfirmLivePrisma();
  const prismaB = createConfirmLivePrisma();
  await prismaA.$connect();
  await prismaB.$connect();

  const results: M1CaseResult[] = [];
  const mode = 'LOCAL_STAGING' as const;
  try {
    results.push(
      await runM101ConcurrentSameKey(prismaA, prismaB, mode, [
        'local-a',
        'local-b',
      ]),
    );
    results.push(await runM102CrashAfterLock(prismaA, prismaB, mode));
    results.push(await runM103LostResponseRetry(prismaA, prismaB, mode));
    results.push(await runM104StaleRevision(prismaA, prismaB, mode));
    results.push(await runM105SameItemTwoConfirms(prismaA, prismaB, mode));

    const hits = new Set<string>();
    for (let n = 0; n < 6; n++) {
      const r = await fetch(`http://127.0.0.1:${portLb}/health`);
      const id = r.headers.get('x-app-instance-id') ?? '';
      if (id) hits.add(id);
    }
    const m106Passed = hits.has('local-a') && hits.has('local-b');
    results.push({
      caseId: 'M1-06',
      passed: m106Passed,
      message: m106Passed
        ? `LB hit instances: ${[...hits].join(',')}`
        : `FAIL hits=${[...hits].join(',')}`,
      packet: {
        caseId: 'M1-06',
        mode,
        passed: m106Passed,
        requestId: 'm1-06-lb',
        confirmId: 'm1-06-lb',
        traceId: 'm1-06-lb',
        hitInstances: [...hits],
        dbLockObservation: 'n/a (LB distribution probe)',
        idempotencyRecord: {},
        applyCount: 0,
        planVersionCount: 0,
        tripRevisionBefore: 0,
        tripRevisionAfter: 0,
        finalDbState: {},
        clientResponses: [{ hitInstances: [...hits] }],
        faultRecoveryResult: 'n/a',
        recordedAt: new Date().toISOString(),
        notes:
          'Local Staging: Redis skipped (M1_LOCAL_SKIP_REDIS=1). Shared PG + dual PID + RR LB.',
      },
    });
  } finally {
    await prismaA.$disconnect().catch(() => undefined);
    await prismaB.$disconnect().catch(() => undefined);
  }

  const paths = results.map((r) => writeM1EvidencePacket(r.packet));
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.caseId}: ${r.message}`);
  }
  console.log('evidence:');
  for (const p of paths) console.log(`  ${p}`);

  const allPassed = results.every((r) => r.passed);
  console.log(
    allPassed
      ? 'M1_LOCAL_STAGING: PASS (Apply+LB). Redis deferred — full HTTP Confirm share still wants Redis.'
      : 'M1_LOCAL_STAGING: FAIL',
  );

  writeFileSync(
    join(
      process.cwd(),
      'evidence/work-packages/AGENT-HARNESS-P0/m1-cases/M1-LOCAL-STAGING-SUMMARY.md',
    ),
    `# M1 Local Staging Summary\n\n**passed:** ${allPassed}\n**topology:** local (embedded PG + dual workers + RR LB; Redis skipped)\n**cases:** ${results.map((r) => `${r.caseId}=${r.passed}`).join(', ')}\n\nProduct remains PRODUCTION NO-GO. First-batch canary: **CONDITIONAL READY** (Redis Confirm-share still open).\n`,
    'utf8',
  );

  childA.kill('SIGTERM');
  childB.kill('SIGTERM');
  lb.close();
  await pg.stop();
  try {
    rmSync(databaseDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
