/**
 * M1 Staging topology preflight — does not run cases.
 *
 * Usage:
 *   npx tsx scripts/m1-staging-preflight.ts
 */
import { isM1StagingTopologyConfigured } from '../src/decision-runtime/execution/authoritative-write/m1-staging-canary.harness';

async function pingRedis(): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return { ok: false, detail: 'REDIS_URL unset' };
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(url, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return { ok: pong === 'PONG', detail: `ping=${pong}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const topo = isM1StagingTopologyConfigured();
  const redis = await pingRedis();

  const dbHint =
    process.env.M1_STAGING_DATABASE_URL?.trim() ||
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  const prodLike = /tripnara_prod|\/production/i.test(dbHint);

  console.log('=== M1 Staging Preflight ===');
  console.log(`topology_ok: ${topo.ok}`);
  if (topo.gaps.length) {
    for (const g of topo.gaps) console.log(`  GAP: ${g}`);
  }
  console.log(`redis_ok: ${redis.ok} (${redis.detail})`);
  console.log(
    `database_hint: ${dbHint ? dbHint.replace(/:[^:@/]+@/, ':***@').slice(0, 96) : '(none)'}`,
  );
  console.log(`refuses_prod: ${prodLike ? 'YES — blocked' : 'no'}`);
  console.log(
    `uwc_session_redis: ${String(process.env.UWC_1E_SESSION_REDIS ?? '').trim() === '1' ? 'ON' : 'OFF (Confirm not shareable across instances)'}`,
  );

  const ready = topo.ok && redis.ok && !prodLike;
  console.log(`M1_STAGING_READY: ${ready ? 'YES' : 'NO'}`);
  console.log(
    ready
      ? 'Next: npm run m1:staging-canary'
      : 'Next: set .env.m1 from .env.m1.example, then re-run preflight. Meanwhile: npm run m1:rehearsal-embedded',
  );
  process.exit(ready ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
