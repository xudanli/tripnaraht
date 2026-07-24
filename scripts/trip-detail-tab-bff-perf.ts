/**
 * Trip Detail Tab BFF latency benchmark (local/staging).
 *
 * Usage:
 *   npx tsx scripts/trip-detail-tab-bff-perf.ts [baseUrl] [tripId]
 *   npx tsx scripts/trip-detail-tab-bff-perf.ts http://localhost:3000/api b72f821a-...
 *
 * Env:
 *   BFF_PERF_ITERATIONS=30   (default 30)
 *   BFF_PERF_WARMUP=5        (default 5)
 *   AUTH_TOKEN=...           (optional Bearer)
 */

const DEFAULT_BASE = 'http://localhost:3000/api';
const DEFAULT_TRIP = 'b72f821a-0026-4d00-84f4-94477bd3f27c';

interface EndpointSpec {
  name: string;
  path: string;
  group: 'bff' | 'baseline' | 'composite';
}

const ENDPOINTS: EndpointSpec[] = [
  { name: 'timeline-overview', path: '/trips/{id}/timeline-overview', group: 'bff' },
  { name: 'collab-overview', path: '/trips/{id}/collab-overview', group: 'bff' },
  { name: 'accommodation-overview', path: '/trips/{id}/accommodation-overview', group: 'bff' },
  { name: 'files-overview', path: '/trips/{id}/files/overview', group: 'bff' },
  { name: 'files-stats', path: '/trips/{id}/files/stats', group: 'bff' },
  { name: 'activity-favorites', path: '/trips/{id}/activity-favorites', group: 'bff' },
  { name: 'trip-getById', path: '/trips/{id}', group: 'baseline' },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const http = argv.find((a) => a.startsWith('http'));
  const trip = argv.find((a) => !a.startsWith('http') && a.includes('-'));
  return {
    baseUrl: (http ?? DEFAULT_BASE).replace(/\/$/, ''),
    tripId: trip ?? DEFAULT_TRIP,
    iterations: Number(process.env.BFF_PERF_ITERATIONS ?? '30'),
    warmup: Number(process.env.BFF_PERF_WARMUP ?? '5'),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function stats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length ? Math.round(sum / sorted.length) : 0,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
  };
}

async function fetchOnce(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ ms: number; status: number; ok: boolean; bytes: number }> {
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.text();
  return {
    ms: performance.now() - started,
    status: res.status,
    ok: res.ok,
    bytes: body.length,
  };
}

async function benchEndpoint(
  spec: EndpointSpec,
  baseUrl: string,
  tripId: string,
  headers: Record<string, string>,
  warmup: number,
  iterations: number,
) {
  const path = spec.path.replace('{id}', tripId);
  for (let i = 0; i < warmup; i += 1) {
    await fetchOnce(baseUrl, path, headers);
  }

  const latencies: number[] = [];
  let lastStatus = 0;
  let lastBytes = 0;
  let errors = 0;

  for (let i = 0; i < iterations; i += 1) {
    const r = await fetchOnce(baseUrl, path, headers);
    latencies.push(r.ms);
    lastStatus = r.status;
    lastBytes = r.bytes;
    if (!r.ok) errors += 1;
  }

  return {
    ...spec,
    path,
    ...stats(latencies),
    status: lastStatus,
    bytes: lastBytes,
    errors,
  };
}

async function benchComposite(
  name: string,
  paths: string[],
  baseUrl: string,
  headers: Record<string, string>,
  warmup: number,
  iterations: number,
) {
  for (let i = 0; i < warmup; i += 1) {
    await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
  }

  const latencies: number[] = [];
  let errors = 0;
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    const results = await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
    latencies.push(performance.now() - started);
    if (results.some((r) => !r.ok)) errors += 1;
  }

  return {
    name,
    path: paths.join(' + '),
    group: 'composite' as const,
    ...stats(latencies),
    status: 200,
    bytes: 0,
    errors,
  };
}

async function benchParallelTabLoad(
  baseUrl: string,
  tripId: string,
  headers: Record<string, string>,
  warmup: number,
  iterations: number,
) {
  const paths = [
    `/trips/${tripId}/timeline-overview`,
    `/trips/${tripId}/collab-overview`,
    `/trips/${tripId}/files/overview`,
    `/trips/${tripId}/accommodation-overview`,
  ];

  for (let i = 0; i < warmup; i += 1) {
    await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
  }

  const latencies: number[] = [];
  let errors = 0;
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    const results = await Promise.all(paths.map((p) => fetchOnce(baseUrl, p, headers)));
    latencies.push(performance.now() - started);
    if (results.some((r) => !r.ok)) errors += 1;
  }

  return {
    name: 'parallel-tab-load (timeline+collab+files+accommodation)',
    path: paths.join(' + '),
    group: 'composite' as const,
    ...stats(latencies),
    status: 200,
    bytes: 0,
    errors,
  };
}

function printRow(r: Awaited<ReturnType<typeof benchEndpoint>>) {
  const err = r.errors > 0 ? ` ERR=${r.errors}` : '';
  console.log(
    `${r.name.padEnd(28)} ${String(r.status).padStart(3)} ${String(r.bytes).padStart(7)}B` +
      `  p50=${String(r.p50).padStart(4)}ms p95=${String(r.p95).padStart(4)}ms p99=${String(r.p99).padStart(4)}ms avg=${String(r.avg).padStart(4)}ms${err}`,
  );
}

async function main() {
  const opts = parseArgs();
  const headers: Record<string, string> = {};
  const token = process.env.AUTH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log(`Trip Detail Tab BFF perf`);
  console.log(`  base=${opts.baseUrl}`);
  console.log(`  trip=${opts.tripId}`);
  console.log(`  warmup=${opts.warmup} iterations=${opts.iterations}`);
  console.log('');
  console.log(
    `${'endpoint'.padEnd(28)} ${'st'.padStart(3)} ${'size'.padStart(7)}  latency (ms)`,
  );
  console.log('-'.repeat(88));

  const results = [];
  for (const spec of ENDPOINTS) {
    const r = await benchEndpoint(
      spec,
      opts.baseUrl,
      opts.tripId,
      headers,
      opts.warmup,
      opts.iterations,
    );
    results.push(r);
    printRow(r);
  }

  const parallel = await benchParallelTabLoad(
    opts.baseUrl,
    opts.tripId,
    headers,
    opts.warmup,
    opts.iterations,
  );
  results.push(parallel);
  printRow(parallel);

  const id = opts.tripId;
  const firstPaint = await benchComposite(
    'loadFirstPaint (shell×2+files+accommodation)',
    [
      `/trips/${id}/timeline-overview?preset=shell`,
      `/trips/${id}/collab-overview?preset=shell`,
      `/trips/${id}/files/overview?limit=50&offset=0`,
      `/trips/${id}/accommodation-overview`,
    ],
    opts.baseUrl,
    headers,
    opts.warmup,
    opts.iterations,
  );
  results.push(firstPaint);
  printRow(firstPaint);

  const phase2 = await benchComposite(
    'loadPhase2 (timeline+collab preset=full)',
    [
      `/trips/${id}/timeline-overview?preset=full`,
      `/trips/${id}/collab-overview?preset=full`,
    ],
    opts.baseUrl,
    headers,
    opts.warmup,
    opts.iterations,
  );
  results.push(phase2);
  printRow(phase2);

  const pageFirstPaint = await benchComposite(
    'page-first-paint (getById+loadFirstPaint)',
    [
      `/trips/${id}`,
      `/trips/${id}/timeline-overview?preset=shell`,
      `/trips/${id}/collab-overview?preset=shell`,
      `/trips/${id}/files/overview?limit=50&offset=0`,
      `/trips/${id}/accommodation-overview`,
    ],
    opts.baseUrl,
    headers,
    opts.warmup,
    opts.iterations,
  );
  results.push(pageFirstPaint);
  printRow(pageFirstPaint);

  const bff = results.filter((r) => r.group === 'bff' && r.errors === 0);
  const baseline = results.find((r) => r.name === 'trip-getById');
  if (bff.length && baseline && baseline.errors === 0) {
    const bffAvg = Math.round(bff.reduce((s, r) => s + r.avg, 0) / bff.length);
    console.log('');
    console.log(`BFF avg (6 endpoints): ${bffAvg}ms | getById baseline: ${baseline.avg}ms`);
    console.log(`Parallel 4-tab load p95: ${parallel.p95}ms`);
    console.log(`loadFirstPaint p95: ${firstPaint.p95}ms | loadPhase2 p95: ${phase2.p95}ms`);
    console.log(`page-first-paint p95: ${pageFirstPaint.p95}ms`);
  }

  const failed = results.filter((r) => r.errors > 0 || r.status >= 400);
  if (failed.length) {
    console.log('');
    console.log('WARN: some endpoints returned errors — check auth or tripId');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
