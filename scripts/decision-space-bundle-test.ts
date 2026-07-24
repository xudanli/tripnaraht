#!/usr/bin/env npx ts-node
/**
 * 决策空间 Bundle 冒烟测试
 *
 * Usage:
 *   npx ts-node scripts/decision-space-bundle-test.ts [tripId] [baseUrl]
 */
const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const api = `${baseUrl}/api/trips/${tripId}`;

async function main() {
  const listRes = await fetch(`${api}/decision-problems`);
  const listJson = (await listRes.json()) as {
    success?: boolean;
    data?: { items?: Array<{ problemId?: string }> };
  };
  const problemId = listJson.data?.items?.[0]?.problemId;
  if (!problemId) {
    console.error('No decision problem found');
    process.exit(1);
  }

  const enc = encodeURIComponent(problemId);
  const bundleUrl = `${api}/decision-space-bundle?problemId=${enc}&surface=default`;
  const t0 = performance.now();
  const res = await fetch(bundleUrl);
  const ms = performance.now() - t0;
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      schema?: string;
      etag?: string;
      problem?: { id?: string; actions?: unknown[] };
      basis?: { whatHappened?: { narrative?: string } };
      inspector?: {
        causalChain?: { nodes?: unknown[] };
        tabEmptyState?: { causalChain?: boolean };
        feasibility?: { canSafelyWrite?: boolean };
      };
      meta?: { included?: string[]; deferred?: string[]; tabEmptyState?: { causalChain?: boolean } };
    };
    error?: { code?: string; message?: string };
  };

  if (!res.ok || !json.success || !json.data) {
    console.error('Bundle failed', res.status, json.error ?? json);
    process.exit(1);
  }

  const d = json.data;
  console.log(`✓ decision-space-bundle ${Math.round(ms)}ms`);
  console.log(`  schema: ${d.schema}`);
  console.log(`  etag: ${d.etag}`);
  console.log(`  problem.id: ${d.problem?.id}`);
  console.log(`  actions: ${d.problem?.actions?.length ?? 0}`);
  console.log(`  basis.narrative: ${d.basis?.whatHappened?.narrative?.slice(0, 60) ?? '(none)'}…`);
  console.log(`  tabEmptyState.causalChain: ${d.inspector?.tabEmptyState?.causalChain ?? d.meta?.tabEmptyState?.causalChain}`);
  console.log(`  feasibility.canSafelyWrite: ${d.inspector?.feasibility?.canSafelyWrite}`);
  console.log(`  causalChain in bundle: ${d.inspector?.causalChain ? 'yes' : 'no'}`);
  console.log(`  included: ${d.meta?.included?.join(', ')}`);
  console.log(`  deferred: ${d.meta?.deferred?.join(', ')}`);

  if (d.schema !== 'tripnara.decision_space_bundle@v1') {
    process.exit(1);
  }
  if (!d.problem?.id) {
    console.error('Missing problem module');
    process.exit(1);
  }
  if (!d.meta?.included?.includes('problem')) {
    console.error('meta.included missing problem');
    process.exit(1);
  }
  const causalEmpty =
    d.meta?.tabEmptyState?.causalChain === true ||
    d.inspector?.tabEmptyState?.causalChain === true;
  if (!causalEmpty) {
    console.error('Expected tabEmptyState.causalChain=true on first pack');
    process.exit(1);
  }
  if (d.inspector?.feasibility?.canSafelyWrite !== false) {
    console.error('Expected feasibility.canSafelyWrite=false on first pack');
    process.exit(1);
  }
  if (d.inspector?.causalChain) {
    console.error('First pack should not include causalChain (lazy load)');
    process.exit(1);
  }

  // decision-causal-chain accepts problemId
  const chainRes = await fetch(
    `${api}/arrange-itinerary/decision-causal-chain?problemId=${enc}`,
  );
  const chainJson = (await chainRes.json()) as {
    success?: boolean;
    data?: { problemId?: string; refreshUrl?: string };
  };
  if (!chainRes.ok || !chainJson.success || chainJson.data?.problemId !== problemId) {
    console.error('decision-causal-chain?problemId failed', chainJson);
    process.exit(1);
  }
  if (!chainJson.data?.refreshUrl?.includes('problemId=')) {
    console.error('causal chain refreshUrl missing problemId', chainJson.data?.refreshUrl);
    process.exit(1);
  }
  console.log('✓ decision-causal-chain?problemId');

  // 400 binding required
  const badRes = await fetch(`${api}/decision-space-bundle`);
  const badJson = (await badRes.json()) as { error?: { code?: string } };
  if (badJson.error?.code !== 'BUNDLE_BINDING_REQUIRED') {
    console.error('Expected BUNDLE_BINDING_REQUIRED', badJson);
    process.exit(1);
  }
  console.log('✓ BUNDLE_BINDING_REQUIRED on missing binding');

  console.log('\n✅ decision-space-bundle smoke passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
