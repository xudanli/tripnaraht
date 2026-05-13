import 'dotenv/config';
import { createClient } from 'redis';
import { ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID } from '../src/agent/memory/decision-ledger/fixtures/iceland-south-coast-wind-staging.fixture';

/**
 * 删除冰岛 staging 的 trip head，并尽力删除其指向的 snapshot 键（与 seed 脚本键前缀一致）。
 *
 *   REDIS_URL=redis://localhost:6379 npx tsx scripts/staging-clean-iceland-memory.ts
 */
async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('REDIS_URL is required');
    process.exit(1);
  }
  const tripId = process.env.STAGING_ICELAND_TRIP_ID?.trim() || ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID;
  const tripHeadKey = `agent:mem_snapshot_trip_head:v1:${tripId}`;

  const client = createClient({ url });
  await client.connect();

  const rawHead = await client.get(tripHeadKey);
  let snapshotId: string | undefined;
  if (rawHead) {
    try {
      const parsed = JSON.parse(rawHead) as { snapshot_id?: string };
      snapshotId = typeof parsed?.snapshot_id === 'string' ? parsed.snapshot_id : undefined;
    } catch {
      snapshotId = undefined;
    }
  }

  if (snapshotId) {
    await client.del(`agent:mem_snapshot:v1:${snapshotId}`);
  }
  await client.del(tripHeadKey);
  await client.quit();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, tripHeadKey, deleted_snapshot: snapshotId ?? null }, null, 2));
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
