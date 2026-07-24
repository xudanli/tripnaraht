/**
 * WP-TEP-13 — IS-CERT-401/402 Real PostgreSQL writeback (opt-in)
 *
 * Skipped unless TEP_WRITEBACK_PG_E2E=1 and DATABASE_URL are set.
 */

import {
  createTepWritebackPgPrisma,
  isTepWritebackPgE2eEnabled,
  runIsCert401ConcurrentPgScenario,
  runIsCert401PgScenario,
  runIsCert402PgScenario,
  runIsCert403PgScenario,
} from './is-cert-writeback-pg.harness';

const describePg = isTepWritebackPgE2eEnabled() ? describe : describe.skip;

describePg('IS-CERT writeback PostgreSQL E2E (opt-in)', () => {
  const prevMat = process.env.RFC001_ITINERARY_MATERIALIZE;
  let prisma: ReturnType<typeof createTepWritebackPgPrisma> | undefined;

  beforeAll(async () => {
    process.env.RFC001_ITINERARY_MATERIALIZE = '1';
    prisma = createTepWritebackPgPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prevMat === undefined) delete process.env.RFC001_ITINERARY_MATERIALIZE;
    else process.env.RFC001_ITINERARY_MATERIALIZE = prevMat;
    if (prisma) await prisma.$disconnect();
  });

  it('IS-CERT-401 real PG idempotent writeback', async () => {
    const result = await runIsCert401PgScenario(prisma);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.idempotentReplay).toBe(false);
  }, 60_000);

  it('IS-CERT-401-CONCURRENT dual accept coalesces to single apply', async () => {
    const result = await runIsCert401ConcurrentPgScenario(prisma);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
  }, 60_000);

  it('IS-CERT-402 real PG rejects STALE_REPAIR_OPTION', async () => {
    const result = await runIsCert402PgScenario(prisma);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
  }, 60_000);

  it('IS-CERT-403 real PG rolls back failed materialization and allows retry', async () => {
    const result = await runIsCert403PgScenario(prisma);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.itineraryMaterialized).toBe(true);
  }, 60_000);
});

if (!isTepWritebackPgE2eEnabled()) {
  it('IS-CERT PG E2E skipped (set TEP_WRITEBACK_PG_E2E=1 + DATABASE_URL)', () => {
    expect(isTepWritebackPgE2eEnabled()).toBe(false);
  });
}
