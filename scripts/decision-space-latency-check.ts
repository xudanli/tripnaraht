#!/usr/bin/env npx ts-node
/**
 * 决策空间接口延迟检查（默认阈值 300ms）
 *
 * Usage:
 *   npx ts-node scripts/decision-space-latency-check.ts [tripId] [baseUrl] [thresholdMs]
 *
 * Example:
 *   npx ts-node scripts/decision-space-latency-check.ts 3e4a1058-9218-467f-988a-c18008a14385
 */
const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const thresholdMs = Number(process.argv[4] ?? 300);
const warmup = 1;
const runs = 5;

const api = `${baseUrl}/api/trips/${tripId}`;

interface Sample {
  name: string;
  avg: number;
  min: number;
  max: number;
  status: number;
  slow: boolean;
  skip?: string;
}

async function fetchStatus(url: string): Promise<{ status: number; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  await res.arrayBuffer().catch(() => null);
  return { status: res.status, ms: performance.now() - t0 };
}

async function measure(name: string, url: string, expectOk = true): Promise<Sample> {
  for (let i = 0; i < warmup; i++) {
    await fetchStatus(url).catch(() => ({ status: 0, ms: 0 }));
  }

  const times: number[] = [];
  let status = 0;
  for (let i = 0; i < runs; i++) {
    const r = await fetchStatus(url).catch(() => ({ status: 0, ms: 999_999 }));
    times.push(r.ms);
    status = r.status;
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const ok = expectOk ? status >= 200 && status < 300 : true;
  const slow = ok && (avg > thresholdMs || max > thresholdMs);

  return {
    name,
    avg,
    min,
    max,
    status,
    slow: slow || (!ok && expectOk),
    ...(!ok && expectOk ? { skip: `HTTP ${status}` } : {}),
  };
}

async function resolveProblemId(): Promise<string | undefined> {
  const res = await fetch(`${api}/decision-problems`, { signal: AbortSignal.timeout(60_000) });
  const json = (await res.json()) as { data?: { items?: Array<{ problemId?: string }> } };
  return json.data?.items?.[0]?.problemId;
}

async function main() {
  console.log(`Trip: ${tripId}`);
  console.log(`Base: ${baseUrl}  阈值: ${thresholdMs}ms  预热: ${warmup}  采样: ${runs}\n`);

  const problemId = await resolveProblemId();
  if (problemId) {
    console.log(`problemId: ${problemId.slice(0, 48)}…\n`);
  } else {
    console.log('problemId: (none — 跳过详情/inspector 类接口)\n');
  }

  const enc = problemId ? encodeURIComponent(problemId) : '';

  const endpoints: Array<{ name: string; url: string; expectOk?: boolean }> = [
    { name: 'decision-problems 列表', url: `${api}/decision-problems` },
    { name: 'planning-conflicts', url: `${api}/planning-conflicts?includeConstraintsSummary=1` },
    { name: 'decision-center/overview', url: `${api}/decision-center/overview` },
    { name: 'planning-workbench-snapshot', url: `${api}/arrange-itinerary/planning-workbench-snapshot` },
  ];

  if (problemId) {
    endpoints.push(
      { name: 'decision-problems/:id', url: `${api}/decision-problems/${enc}` },
      {
        name: 'decision-inspector?problemId',
        url: `${api}/arrange-itinerary/decision-inspector?problemId=${enc}`,
      },
      { name: 'decision-causal-chain', url: `${api}/arrange-itinerary/decision-causal-chain` },
      {
        name: 'decision-basis?problemId',
        url: `${api}/arrange-itinerary/decision-basis?problemId=${enc}`,
      },
      {
        name: 'decision-space-bundle (default)',
        url: `${api}/decision-space-bundle?problemId=${enc}&surface=default`,
      },
    );
  }

  // 非首屏 — 仅报告，不计入 fail
  endpoints.push({
    name: 'decision-center (full, 勿首屏)',
    url: `${api}/decision-center`,
    expectOk: true,
  });

  const results: Sample[] = [];
  for (const ep of endpoints) {
    process.stdout.write(`  measuring ${ep.name}…`);
    const sample = await measure(ep.name, ep.url, ep.expectOk !== false);
    results.push(sample);
    console.log(` ${sample.avg.toFixed(0)}ms avg`);
  }

  console.log(`\n${'接口'.padEnd(34)} ${'avg'.padStart(7)} ${'min'.padStart(7)} ${'max'.padStart(7)} ${'HTTP'.padStart(5)}  >${thresholdMs}ms`);
  console.log('-'.repeat(72));

  const strictNames = new Set([
    'decision-problems 列表',
    'planning-conflicts',
    'decision-center/overview',
    'decision-problems/:id',
    'decision-inspector?problemId',
    'decision-basis?problemId',
  ]);

  const warnOnlyNames = new Set([
    'planning-workbench-snapshot',
    'decision-causal-chain',
    'decision-center (full, 勿首屏)',
    'decision-space-bundle (default)', // SLA P95 ≤800ms，含因果链聚合
  ]);

  const failures: Sample[] = [];
  const warnings: Sample[] = [];
  for (const r of [...results].sort((a, b) => b.avg - a.avg)) {
    const flag = r.skip ? `ERR ${r.skip}` : r.slow ? '⚠️' : '✓';
    console.log(
      `${r.name.padEnd(34)} ${String(Math.round(r.avg)).padStart(6)}ms ${String(Math.round(r.min)).padStart(6)}ms ${String(Math.round(r.max)).padStart(6)}ms ${String(r.status).padStart(5)}  ${flag}`,
    );
    if (r.skip || !r.slow) continue;
    if (strictNames.has(r.name)) failures.push(r);
    else if (warnOnlyNames.has(r.name)) warnings.push(r);
  }

  console.log('\n── 建议 ──');
  console.log('  左栏首屏: decision-problems + planning-conflicts + overview（并行）');
  console.log('  选中问题: decision-problems/:id → decision-inspector?problemId');
  console.log('  因果链 Tab: decision-causal-chain 懒加载（通常 >300ms）');
  console.log('  勿首屏: GET decision-center（full）');

  if (warnings.length) {
    console.log(`\n⚠️  懒加载/非首屏接口 > ${thresholdMs}ms（建议 Tab 切换时再拉）:`);
    for (const w of warnings) {
      console.log(`  • ${w.name}: avg ${Math.round(w.avg)}ms max ${Math.round(w.max)}ms`);
    }
  }

  if (failures.length) {
    console.log(`\n❌ 首屏/核心接口未达标 ${failures.length} 项:`);
    for (const f of failures) {
      console.log(`  • ${f.name}: avg ${Math.round(f.avg)}ms max ${Math.round(f.max)}ms${f.skip ? ` (${f.skip})` : ''}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ 首屏核心接口均 ≤ ${thresholdMs}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
