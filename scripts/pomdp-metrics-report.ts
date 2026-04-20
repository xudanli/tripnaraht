import * as fs from 'node:fs';
import * as path from 'node:path';

type Event = {
  type: string;
  at?: string;
  countryCode?: string;
  month?: number;
  observationIndependenceTier?: string;
  windSpeedMetaSource?: string;
  refinementEffective?: boolean;
  weightJSDivergence?: number;
  weightL1Delta?: number;
  deltaEntropy01?: number;
  deltaEss?: number;
  observationFusionOrder?: string[];
};

function parseEventFromLine(line: string): Event | null {
  const idx = line.indexOf('[POMDP_METRIC]');
  if (idx < 0) return null;
  const jsonStart = line.indexOf('{', idx);
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(line.slice(jsonStart)) as Event;
  } catch {
    return null;
  }
}

function quantile(xs: number[], q: number): number | undefined {
  const arr = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return undefined;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil(q * arr.length) - 1));
  return arr[idx];
}

function bucketKey(e: Event): string {
  const cc = e.countryCode ?? 'NA';
  const m = e.month ?? -1;
  const tier = e.observationIndependenceTier ?? 'NA';
  const src = e.windSpeedMetaSource ?? 'NA';
  return `${cc}|m=${m}|tier=${tier}|src=${src}`;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    // eslint-disable-next-line no-console
    console.error(`Usage: tsx ${path.basename(process.argv[1])} <log-file>`);
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const events: Event[] = [];
  for (const line of raw.split('\n')) {
    const e = parseEventFromLine(line);
    if (e) events.push(e);
  }

  const byBucket = new Map<string, Event[]>();
  for (const e of events) {
    const k = bucketKey(e);
    const arr = byBucket.get(k) ?? [];
    arr.push(e);
    byBucket.set(k, arr);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    totalEvents: events.length,
    buckets: Array.from(byBucket.entries()).map(([k, arr]) => {
      const js = arr.map((e) => e.weightJSDivergence ?? NaN);
      const l1 = arr.map((e) => e.weightL1Delta ?? NaN);
      const de = arr.map((e) => e.deltaEntropy01 ?? NaN);
      const ds = arr.map((e) => e.deltaEss ?? NaN);
      const applied = arr.filter((e) => e.type === 'POMDP_REFINEMENT_APPLIED').length;
      const eff = arr.filter((e) => e.refinementEffective).length;
      const orders: Record<string, number> = {};
      for (const e of arr) {
        const o = Array.isArray(e.observationFusionOrder) ? e.observationFusionOrder.join('>') : 'NA';
        orders[o] = (orders[o] ?? 0) + 1;
      }
      return {
        bucket: k,
        n: arr.length,
        applied,
        effective: eff,
        js_p50: quantile(js, 0.5),
        js_p90: quantile(js, 0.9),
        l1_p50: quantile(l1, 0.5),
        l1_p90: quantile(l1, 0.9),
        deltaEntropy_p50: quantile(de, 0.5),
        deltaEss_p50: quantile(ds, 0.5),
        orderTop: Object.entries(orders).sort((a, b) => b[1] - a[1]).slice(0, 5),
      };
    }),
  }, null, 2));
}

main();

