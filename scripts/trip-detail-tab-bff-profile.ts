/**
 * Trip Detail Tab BFF — downstream dependency profiler + include matrix.
 *
 * Usage:
 *   npx tsx scripts/trip-detail-tab-bff-profile.ts [baseUrl] [tripId]
 *
 * Env: BFF_PERF_ITERATIONS=15 BFF_PERF_WARMUP=2 AUTH_TOKEN=...
 */

const DEFAULT_BASE = 'http://localhost:3000/api';
const DEFAULT_TRIP = '3e4a1058-9218-467f-988a-c18008a14385';

interface DepSpec {
  group: 'timeline' | 'collab';
  name: string;
  path: string;
}

const TIMELINE_DEPS: DepSpec[] = [
  { group: 'timeline', name: 'findOne (preflight)', path: '/trips/{id}' },
  { group: 'timeline', name: 'pipeline-status', path: '/trips/{id}/pipeline-status' },
  { group: 'timeline', name: 'metrics', path: '/trips/{id}/metrics' },
  { group: 'timeline', name: 'conflicts', path: '/trips/{id}/conflicts' },
  { group: 'timeline', name: 'tasks', path: '/trips/{id}/tasks' },
  { group: 'timeline', name: 'persona-alerts', path: '/trips/{id}/persona-alerts' },
  {
    group: 'timeline',
    name: 'suggestions',
    path: '/trips/{id}/suggestions?status=NEW&limit=200',
  },
  { group: 'timeline', name: 'files-stats', path: '/trips/{id}/files/stats' },
];

const COLLAB_DEPS: DepSpec[] = [
  { group: 'collab', name: 'collaborators', path: '/trips/{id}/collaborators' },
  { group: 'collab', name: 'collaborative-tasks', path: '/trips/{id}/collaborative-tasks' },
  { group: 'collab', name: 'domain-influence', path: '/trips/{id}/domain-influence' },
  { group: 'collab', name: 'silent-votes', path: '/trips/{id}/silent-votes' },
  {
    group: 'collab',
    name: 'profiling-onboarding',
    path: '/trips/{id}/decision-profiling/onboarding',
  },
  {
    group: 'collab',
    name: 'friction-radar',
    path: '/trips/{id}/decision-profiling/friction-radar',
  },
  { group: 'collab', name: 'wishes-summary', path: '/trips/{id}/wishes/summary' },
];

const INCLUDE_MATRIX = [
  {
    label: 'timeline default (all)',
    path: '/trips/{id}/timeline-overview',
  },
  {
    label: 'timeline stats-only',
    path: '/trips/{id}/timeline-overview?include=stats',
  },
  {
    label: 'timeline preset=shell',
    path: '/trips/{id}/timeline-overview?preset=shell',
  },
  {
    label: 'timeline stats+pipeline',
    path: '/trips/{id}/timeline-overview?include=stats,pipeline',
  },
  {
    label: 'timeline stats+tasks',
    path: '/trips/{id}/timeline-overview?include=stats,tasks',
  },
  {
    label: 'timeline no-suggestions',
    path: '/trips/{id}/timeline-overview?include=stats,pipeline,tasks,reminders',
  },
  {
    label: 'collab default (all)',
    path: '/trips/{id}/collab-overview',
  },
  {
    label: 'collab health-shell',
    path: '/trips/{id}/collab-overview?include=members,health',
  },
  {
    label: 'collab preset=shell',
    path: '/trips/{id}/collab-overview?preset=shell',
  },
  {
    label: 'collab members+tasks',
    path: '/trips/{id}/collab-overview?include=members,tasks',
  },
  {
    label: 'collab no-profiling',
    path: '/trips/{id}/collab-overview?include=members,tasks,domain,votes,wishes',
  },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const http = argv.find((a) => a.startsWith('http'));
  const trip = argv.find((a) => !a.startsWith('http') && a.includes('-'));
  return {
    baseUrl: (http ?? DEFAULT_BASE).replace(/\/$/, ''),
    tripId: trip ?? DEFAULT_TRIP,
    iterations: Number(process.env.BFF_PERF_ITERATIONS ?? '15'),
    warmup: Number(process.env.BFF_PERF_WARMUP ?? '2'),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function latencyStats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    avg: sorted.length ? Math.round(sum / sorted.length) : 0,
  };
}

async function fetchOnce(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ ms: number; ok: boolean; status: number }> {
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, { headers });
  await res.text();
  return {
    ms: performance.now() - started,
    ok: res.ok,
    status: res.status,
  };
}

async function benchPath(
  baseUrl: string,
  pathTemplate: string,
  tripId: string,
  headers: Record<string, string>,
  warmup: number,
  iterations: number,
) {
  const path = pathTemplate.replace('{id}', tripId);
  for (let i = 0; i < warmup; i += 1) {
    await fetchOnce(baseUrl, path, headers);
  }
  const latencies: number[] = [];
  let status = 0;
  let ok = true;
  for (let i = 0; i < iterations; i += 1) {
    const r = await fetchOnce(baseUrl, path, headers);
    latencies.push(r.ms);
    status = r.status;
    if (!r.ok) ok = false;
  }
  return { path, ...latencyStats(latencies), status, ok };
}

function printDepRow(name: string, r: Awaited<ReturnType<typeof benchPath>>) {
  const flag = r.ok ? '' : ` !${r.status}`;
  console.log(
    `  ${name.padEnd(24)} p50=${String(r.p50).padStart(5)}ms p95=${String(r.p95).padStart(5)}ms avg=${String(r.avg).padStart(5)}ms${flag}`,
  );
}

async function benchParallelDeps(
  baseUrl: string,
  deps: DepSpec[],
  tripId: string,
  headers: Record<string, string>,
  warmup: number,
  iterations: number,
) {
  const paths = deps.map((d) => d.path.replace('{id}', tripId));
  for (let i = 0; i < warmup; i += 1) {
    await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
  }
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
    latencies.push(performance.now() - started);
  }
  return latencyStats(latencies);
}

async function main() {
  const opts = parseArgs();
  const headers: Record<string, string> = {};
  const token = process.env.AUTH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log('Trip Detail Tab BFF — dependency profile');
  console.log(`  base=${opts.baseUrl}`);
  console.log(`  trip=${opts.tripId}`);
  console.log(`  warmup=${opts.warmup} iterations=${opts.iterations}`);
  console.log('');

  console.log('=== Timeline downstream (serial-ish via BFF; measured individually) ===');
  const timelineResults: Array<{ name: string; result: Awaited<ReturnType<typeof benchPath>> }> =
    [];
  for (const dep of TIMELINE_DEPS) {
    const result = await benchPath(
      opts.baseUrl,
      dep.path,
      opts.tripId,
      headers,
      opts.warmup,
      opts.iterations,
    );
    timelineResults.push({ name: dep.name, result });
    printDepRow(dep.name, result);
  }

  const timelineParallel = await benchParallelDeps(
    opts.baseUrl,
    TIMELINE_DEPS.slice(1),
    opts.tripId,
    headers,
    opts.warmup,
    opts.iterations,
  );
  const findOne = timelineResults.find((r) => r.name.startsWith('findOne'))?.result;
  const timelineBffDefault = await benchPath(
    opts.baseUrl,
    '/trips/{id}/timeline-overview',
    opts.tripId,
    headers,
    opts.warmup,
    opts.iterations,
  );
  console.log('');
  console.log(
    `  ${'parallel deps (excl findOne)'.padEnd(24)} p50=${timelineParallel.p50}ms p95=${timelineParallel.p95}ms avg=${timelineParallel.avg}ms`,
  );
  if (findOne) {
    console.log(
      `  ${'est. serial sum p95'.padEnd(24)} ~${findOne.p95 + timelineParallel.p95}ms (findOne + parallel)`,
    );
  }
  printDepRow('timeline-overview BFF', timelineBffDefault);

  console.log('');
  console.log('=== Collab downstream ===');
  const collabResults: Array<{ name: string; result: Awaited<ReturnType<typeof benchPath>> }> = [];
  for (const dep of COLLAB_DEPS) {
    const result = await benchPath(
      opts.baseUrl,
      dep.path,
      opts.tripId,
      headers,
      opts.warmup,
      opts.iterations,
    );
    collabResults.push({ name: dep.name, result });
    printDepRow(dep.name, result);
  }

  const collabParallel = await benchParallelDeps(
    opts.baseUrl,
    COLLAB_DEPS,
    opts.tripId,
    headers,
    opts.warmup,
    opts.iterations,
  );
  const collabBffDefault = await benchPath(
    opts.baseUrl,
    '/trips/{id}/collab-overview',
    opts.tripId,
    headers,
    opts.warmup,
    opts.iterations,
  );
  console.log('');
  console.log(
    `  ${'parallel all deps'.padEnd(24)} p50=${collabParallel.p50}ms p95=${collabParallel.p95}ms avg=${collabParallel.avg}ms`,
  );
  printDepRow('collab-overview BFF', collabBffDefault);

  console.log('');
  console.log('=== Include matrix (BFF p95) ===');
  const matrixRows: Array<{ label: string; p95: number; p50: number; ok: boolean }> = [];
  for (const row of INCLUDE_MATRIX) {
    const r = await benchPath(
      opts.baseUrl,
      row.path,
      opts.tripId,
      headers,
      opts.warmup,
      opts.iterations,
    );
    matrixRows.push({ label: row.label, p95: r.p95, p50: r.p50, ok: r.ok });
    const flag = r.ok ? '' : ` !${r.status}`;
    console.log(`  ${row.label.padEnd(28)} p50=${String(r.p50).padStart(5)}ms p95=${String(r.p95).padStart(5)}ms${flag}`);
  }

  const timelineDefault = matrixRows.find((r) => r.label === 'timeline default (all)');
  const timelineStatsOnly = matrixRows.find((r) => r.label === 'timeline stats-only');
  const collabDefault = matrixRows.find((r) => r.label === 'collab default (all)');
  const collabHealth = matrixRows.find((r) => r.label === 'collab health-shell');

  console.log('');
  console.log('=== Top slow deps (p95) ===');
  const allDeps = [...timelineResults, ...collabResults]
    .map((r) => ({ name: `${r.name}`, p95: r.result.p95, group: TIMELINE_DEPS.some((d) => d.name === r.name) ? 'timeline' : 'collab' }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 6);
  for (const d of allDeps) {
    console.log(`  [${d.group}] ${d.name}: ${d.p95}ms`);
  }

  console.log('');
  console.log('=== Recommendations ===');
  if (timelineDefault && timelineStatsOnly) {
    const saved = timelineDefault.p95 - timelineStatsOnly.p95;
    console.log(
      `  timeline include=stats only saves ~${saved}ms p95 vs default (${timelineDefault.p95} → ${timelineStatsOnly.p95}ms)`,
    );
  }
  if (collabDefault && collabHealth) {
    const saved = collabDefault.p95 - collabHealth.p95;
    console.log(
      `  collab include=members,health saves ~${saved}ms p95 vs default (${collabDefault.p95} → ${collabHealth.p95}ms)`,
    );
  }
  console.log('  Tab 首屏建议: stats-only timeline + members,health collab 二段 lazy-load 其余 include');

  const failed = [
    ...timelineResults,
    ...collabResults,
  ].filter((r) => !r.result.ok);
  if (failed.length) {
    console.log('');
    console.log(`WARN: ${failed.length} downstream endpoint(s) failed — check auth`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
