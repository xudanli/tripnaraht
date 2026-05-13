import 'dotenv/config';
import { createClient } from 'redis';
import {
  buildIcelandSouthCoastWindStagingMemoryContext,
  buildIcelandSouthCoastWindStagingRedisEnvelope,
  ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID,
} from '../src/agent/memory/decision-ledger/fixtures/iceland-south-coast-wind-staging.fixture';
import { deriveLedgerHealingUiStateV1 } from '../src/agent/contracts/ledger-healing-ui-state.v1';
import { buildLedgerHealingObservabilityV1 } from '../src/agent/memory/decision-ledger/ledger-healing-observability.util';

/**
 * 将「南岸大风 → 黑沙滩 INVALIDATED」staging 账本写入 Redis（与 Nest `MemorySnapshotPersistenceService` 键一致）。
 *
 * 用法：
 *   REDIS_URL=redis://localhost:6379 npx tsx scripts/seed-iceland-ledger-drift-staging.ts
 *
 * 成功后可用 `trip_id=${ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID}` 发起 route_and_run（需关 LLM_USE_MOCK 才会真调 reconcile）。
 * 若运行环境使用 cache-manager 包装键，请先在 staging `KEYS *mem_snapshot*` 核对实际前缀后再调整本脚本。
 */
async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('REDIS_URL is required (e.g. redis://localhost:6379)');
    process.exit(1);
  }

  const mem = buildIcelandSouthCoastWindStagingMemoryContext();
  const { snapshotKey, tripHeadKey, envelope } = buildIcelandSouthCoastWindStagingRedisEnvelope(mem);

  const client = createClient({ url });
  client.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('Redis client error', err);
  });
  await client.connect();

  const ttl = 7 * 24 * 60 * 60;
  await client.set(snapshotKey, JSON.stringify(envelope), { EX: ttl });
  await client.set(tripHeadKey, JSON.stringify({ snapshot_id: mem.snapshotId }), { EX: ttl });
  await client.quit();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, snapshotKey, tripHeadKey, trip_id: ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID }, null, 2));

  const demoHealing = buildLedgerHealingObservabilityV1({
    initialInvalidatedCount: 1,
    ranBlockingReconcile: true,
    invalidatedNodeIds: ['POI_REYNISFJARA'],
    reconcileResult: {
      status: 'CONVERGED',
      trace: [
        'loop_0: merged=1 secondary=1 stable=false',
        'loop_1: merged=1 secondary=0 stable=true',
        'converged: snapshot_version=2',
      ],
    },
  });
  // eslint-disable-next-line no-console
  console.log('\n# Example UI state mapping (illustrative)\n', JSON.stringify(deriveLedgerHealingUiStateV1(demoHealing), null, 2));
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
