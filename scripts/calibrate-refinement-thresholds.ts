import * as fs from 'node:fs';
import * as path from 'node:path';

type Event = {
  type: string;
  countryCode?: string;
  month?: number;
  observationIndependenceTier?: string;
  windSpeedMetaSource?: string;
  refinementEffective?: boolean;
  weightJSDivergence?: number;
  weightL1Delta?: number;
  refinementThresholds?: { n: number; l1: number; js: number };
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

function q(xs: number[], p: number): number | undefined {
  const arr = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return undefined;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil(p * arr.length) - 1));
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
  const outPath = process.argv[3] ?? 'config/refinement-thresholds.json';
  if (!inputPath) {
    // eslint-disable-next-line no-console
    console.error(`Usage: tsx ${path.basename(process.argv[1])} <log-file> [out-json]`);
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const events: Event[] = [];
  for (const line of raw.split('\n')) {
    const e = parseEventFromLine(line);
    if (e) events.push(e);
  }

  const buckets = new Map<string, Event[]>();
  for (const e of events) {
    const k = bucketKey(e);
    const arr = buckets.get(k) ?? [];
    arr.push(e);
    buckets.set(k, arr);
  }

  const output: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    sourceLog: inputPath,
    strategy: {
      js: 'max(p90(skipped), default)',
      l1: 'max(p90(skipped), default)',
    },
    buckets: {},
  };

  const outBuckets: Record<string, unknown> = {};
  for (const [k, arr] of buckets.entries()) {
    const skipped = arr.filter((e) => e.type === 'POMDP_REFINEMENT_SKIPPED' && e.weightJSDivergence !== undefined);
    const nMed = q(arr.map((e) => e.refinementThresholds?.n ?? NaN), 0.5) ?? 50;
    const defaultJs = Math.max(1e-9, 1e-6 / Math.sqrt(nMed));
    const defaultL1 = Math.max(1e-6, 1e-3 / Math.sqrt(nMed));
    const jsP90 = q(skipped.map((e) => e.weightJSDivergence ?? NaN), 0.9);
    const l1P90 = q(skipped.map((e) => e.weightL1Delta ?? NaN), 0.9);
    outBuckets[k] = {
      n: arr.length,
      skipped: skipped.length,
      recommended: {
        js: Math.max(defaultJs, jsP90 ?? defaultJs),
        l1: Math.max(defaultL1, l1P90 ?? defaultL1),
      },
    };
  }

  (output as any).buckets = outBuckets;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`);
}

main();

