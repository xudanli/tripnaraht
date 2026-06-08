import 'dotenv/config';
import { createClient } from 'redis';
import {
  buildCoastalPivotConstraintSinkObservability,
  buildIcelandCoastalPivotStagingMemoryContext,
  buildIcelandCoastalPivotStagingRedisEnvelope,
  buildIcelandCoastalPivotStagingTripTaskMemory,
  ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID,
  ICELAND_COASTAL_PIVOT_STAGING_USER_ID,
} from '../src/agent/memory/decision-ledger/fixtures/iceland-coastal-pivot-staging.fixture';
import { mergeConstraintSinkIntoMemoryContractObs } from '../src/agent/memory/constraint-sink/hydrate-trip-plan-from-constraint-sink.util';

/**
 * 写入「南岸 pivot → 内陆」Constraint Sink staging 数据（Memory snapshot + TripTaskMemory）。
 *
 * 用法：
 *   REDIS_URL=redis://localhost:6379 npx tsx scripts/seed-trip-iceland-coastal-pivot-staging.ts
 *
 * 验证 TC-SINK-01（无 recent_messages）：
 *   FEATURE_MEMORY_CONSTRAINT_SINK=1
 *   trip_id=trip-iceland-coastal-pivot-staging
 *   user_id=staging-user-coastal-pivot
 *   message=帮我生成方案
 */
async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('REDIS_URL is required (e.g. redis://localhost:6379)');
    process.exit(1);
  }

  const mem = buildIcelandCoastalPivotStagingMemoryContext();
  const tripTask = buildIcelandCoastalPivotStagingTripTaskMemory();
  const { snapshotKey, tripHeadKey, tripTaskMemoryKey, envelope } =
    buildIcelandCoastalPivotStagingRedisEnvelope(mem);

  const client = createClient({ url });
  client.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('Redis client error', err);
  });
  await client.connect();

  const ttl = 7 * 24 * 60 * 60;
  await client.set(snapshotKey, JSON.stringify(envelope), { EX: ttl });
  await client.set(tripHeadKey, JSON.stringify({ snapshot_id: mem.snapshotId }), { EX: ttl });
  await client.set(tripTaskMemoryKey, JSON.stringify(tripTask), { EX: ttl });
  await client.quit();

  const memoryContractObs = mergeConstraintSinkIntoMemoryContractObs(
    {
      revision: 'v1',
      loaded: true,
      layers: ['L1_user_profile', 'fixture:iceland_coastal_pivot_staging'],
      user_id_present: true,
      snapshot_id: mem.snapshotId,
      snapshot_version: 1,
      loaded_at_iso: mem.loadedAt,
    },
    buildCoastalPivotConstraintSinkObservability(),
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        trip_id: ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID,
        user_id: ICELAND_COASTAL_PIVOT_STAGING_USER_ID,
        snapshotKey,
        tripHeadKey,
        tripTaskMemoryKey,
        example_memory_contract_obs: memoryContractObs,
      },
      null,
      2,
    ),
  );
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
