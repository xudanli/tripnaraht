/**
 * SDR-202 — destination daylight rules pack loader
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface DaylightRulesPack {
  schemaId: string;
  destination: string;
  policies: {
    highRiskRoadMustFinishBefore: 'CIVIL_TWILIGHT_END' | 'SUNSET';
    outdoorActivityMustFinishBefore: 'SUNSET' | 'CIVIL_TWILIGHT_END';
    nightDrivingDefaultPolicy: 'NEED_CONFIRM' | 'SUGGEST_REPAIR';
    noNightDrivingProfilePolicy: 'SUGGEST_REPAIR' | 'REJECT';
  };
  computation: {
    mode: 'LATITUDE_MONTHLY_TABLE' | 'SUN_CALC';
    defaultLatitude: number;
    defaultLongitude?: number;
    fallbackTimezone: string;
  };
}

const cache = new Map<string, DaylightRulesPack | null>();

export function loadDaylightRules(countryCode: string): DaylightRulesPack | null {
  const cc = countryCode.toUpperCase();
  if (cache.has(cc)) return cache.get(cc) ?? null;

  const path = join(
    process.cwd(),
    'data',
    'destination-packs',
    cc.toLowerCase(),
    'rules',
    `${cc.toLowerCase()}-daylight-rules.json`,
  );

  try {
    const pack = JSON.parse(readFileSync(path, 'utf8')) as DaylightRulesPack;
    cache.set(cc, pack);
    return pack;
  } catch {
    cache.set(cc, null);
    return null;
  }
}

export function clearDaylightRulesCache(): void {
  cache.clear();
}
