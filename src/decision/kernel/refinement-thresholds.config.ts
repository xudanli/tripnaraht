import * as fs from 'node:fs';

export interface RefinementThresholdsBucket {
  recommended?: { js?: number; l1?: number };
}

export interface RefinementThresholdsConfigFile {
  generatedAt?: string;
  sourceLog?: string;
  buckets?: Record<string, RefinementThresholdsBucket>;
}

let cached: { path?: string; mtimeMs?: number; cfg?: RefinementThresholdsConfigFile } = {};

export function loadRefinementThresholdsConfig(): RefinementThresholdsConfigFile | undefined {
  const p = process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE;
  if (!p) return undefined;
  try {
    const stat = fs.statSync(p);
    if (cached.path === p && cached.mtimeMs === stat.mtimeMs && cached.cfg) return cached.cfg;
    const raw = fs.readFileSync(p, 'utf8');
    const cfg = JSON.parse(raw) as RefinementThresholdsConfigFile;
    cached = { path: p, mtimeMs: stat.mtimeMs, cfg };
    return cfg;
  } catch {
    return undefined;
  }
}

export function thresholdsBucketKey(input: {
  countryCode?: string;
  month?: number;
  tier?: string;
  src?: string;
}): string {
  const cc = input.countryCode ?? 'NA';
  const m = typeof input.month === 'number' ? input.month : -1;
  const tier = input.tier ?? 'NA';
  const src = input.src ?? 'NA';
  return `${cc}|m=${m}|tier=${tier}|src=${src}`;
}

