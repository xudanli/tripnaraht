import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PlowServiceBand } from './iceland-winter-knowledge.types';

const IS_PACK = 'data/destination-packs/is';

export interface SnowPlowPolicyFile {
  schemaId: string;
  version: string;
  status: string;
  plowRuleCodes: Record<
    string,
    {
      serviceBand: PlowServiceBand;
      delayRangeMinutes: [number, number] | null;
    }
  >;
  winterServiceLevelDefaults?: Record<string, { expectPlow: boolean }>;
}

function readJson<T>(abs: string): T {
  if (!existsSync(abs)) throw new Error(`Missing snow plow policy: ${abs}`);
  return JSON.parse(readFileSync(abs, 'utf8')) as T;
}

export function loadIcelandSnowPlowPolicy(
  cwd: string = process.cwd(),
): SnowPlowPolicyFile {
  return readJson(
    join(cwd, IS_PACK, 'knowledge/road/is-snow-plow-policy.json'),
  );
}
