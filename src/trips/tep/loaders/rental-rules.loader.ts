/**
 * SDR-003 — destination rental contract rules pack loader
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export type RentalRestrictionCode = string;

export interface RentalRestrictionRule {
  description: string;
  match?: {
    roadClasses?: string[];
  };
  outcome?: 'REJECT' | 'NEED_CONFIRM' | 'SUGGEST_REPAIR';
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  gravelRatioThreshold?: number;
  outcomeAboveThreshold?: 'REJECT' | 'NEED_CONFIRM';
  severityAboveThreshold?: 'HIGH' | 'MEDIUM' | 'CRITICAL';
  outcomeBelowThreshold?: 'NEED_CONFIRM' | 'CAUTION';
  severityBelowThreshold?: 'MEDIUM' | 'LOW';
  unknownRoadOutcome?: 'NEED_CONFIRM' | 'UNKNOWN';
  unknownRoadSeverity?: 'MEDIUM' | 'HIGH';
}

export interface RentalRulesPack {
  schemaId: string;
  destination: string;
  version: string;
  restrictions: Record<RentalRestrictionCode, RentalRestrictionRule>;
}

const cache = new Map<string, RentalRulesPack | null>();

export function loadRentalRules(countryCode: string): RentalRulesPack | null {
  const cc = countryCode.toUpperCase();
  if (cache.has(cc)) return cache.get(cc) ?? null;

  const path = join(
    process.cwd(),
    'data',
    'destination-packs',
    cc.toLowerCase(),
    'rules',
    `${cc.toLowerCase()}-rental-rules.json`,
  );

  try {
    const pack = JSON.parse(readFileSync(path, 'utf8')) as RentalRulesPack;
    cache.set(cc, pack);
    return pack;
  } catch {
    cache.set(cc, null);
    return null;
  }
}

export function clearRentalRulesCache(): void {
  cache.clear();
}
