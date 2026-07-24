/**
 * Map Place.ontologyRules JSONB → PoiAccessRule[] (fallback when PoiAccessRule table empty).
 */

import type {
  PoiAccessConfidence,
  PoiAccessEnforcement,
  PoiAccessRule,
  PoiAccessRuleType,
} from '../interfaces/poi-access-capacity.interface';

type OntologyRuleV1 = {
  id?: string;
  type?: string;
  source?: string;
  description?: string;
  restriction?: string;
  condition?: unknown;
  updatedAt?: string;
};

function normalizeType(raw?: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

function mapOntologyTypeToRuleType(type: string, description: string): PoiAccessRuleType {
  const text = `${type} ${description}`.toLowerCase();
  if (/reserv|booking|预订|预约/.test(text)) return 'RESERVATION_REQUIRED';
  if (/parking|停车/.test(text)) return 'PARKING_RESERVATION';
  if (/trail|步道|hiking|登山/.test(text)) return 'TRAIL_RESTRICTION';
  if (/vehicle|4wd|四驱|f-road|f208/.test(text)) return 'VEHICLE_RESTRICTION';
  if (/season|close|关闭|winter|冬季/.test(text)) return 'SEASONAL_CLOSURE';
  if (/time.?window|hours|开放/.test(text)) return 'TIME_WINDOW';
  return 'SAFETY_RESTRICTION';
}

function mapEnforcement(type: string, description: string): PoiAccessEnforcement {
  const text = `${type} ${description}`.toLowerCase();
  if (/prohibit|禁止|closed|关闭|must|required|需/.test(text)) return 'HARD';
  return 'SOFT';
}

function mapConfidence(source?: string): PoiAccessConfidence {
  const s = String(source ?? '').toLowerCase();
  if (/road\.is|safetravel|official|国家公园|government/.test(s)) return 'OFFICIAL';
  if (/partner|parka|vatnajokull/.test(s)) return 'PARTNER';
  return 'INFERRED';
}

function extractRulesV1(doc: Record<string, unknown>): OntologyRuleV1[] {
  const raw = doc.rules_v1;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === 'object') as OntologyRuleV1[];
}

function ruleNotes(entry: OntologyRuleV1): string {
  const parts = [entry.description, entry.restriction].filter(Boolean);
  if (entry.condition && typeof entry.condition === 'object') {
    parts.push(JSON.stringify(entry.condition));
  } else if (typeof entry.condition === 'string') {
    parts.push(entry.condition);
  }
  return parts.join(' · ').slice(0, 2000);
}

/**
 * Convert Place.ontologyRules to access rules for a POI slug.
 * Skips pure equipment-only entries unless they imply safety/trail constraints.
 */
export function placeOntologyToAccessRules(
  poiId: string,
  placeId: number,
  ontologyRules: unknown,
): PoiAccessRule[] {
  if (!ontologyRules || typeof ontologyRules !== 'object' || Array.isArray(ontologyRules)) {
    return [];
  }

  const doc = ontologyRules as Record<string, unknown>;
  const verifiedAt =
    typeof doc.updatedAt === 'string'
      ? doc.updatedAt
      : new Date().toISOString();

  const out: PoiAccessRule[] = [];
  for (const entry of extractRulesV1(doc)) {
    const type = normalizeType(entry.type);
    if (type === 'equipment' || type === 'fee') continue;

    const description = [entry.description, entry.restriction].filter(Boolean).join(' ');
    if (!description.trim()) continue;

    const ruleType = mapOntologyTypeToRuleType(type, description);
    const enforcement = mapEnforcement(type, description);

    out.push({
      id: `ontology:${placeId}:${entry.id ?? type}`,
      poiId,
      placeId,
      ruleType,
      targetResource: ruleType === 'TRAIL_RESTRICTION' ? 'TRAIL' : 'POI',
      status: 'ACTIVE',
      enforcement,
      sourceAuthority: entry.source?.trim() || 'Place.ontologyRules',
      lastVerifiedAt: entry.updatedAt ?? verifiedAt,
      confidence: mapConfidence(entry.source),
      notes: ruleNotes(entry),
    });
  }

  return out;
}
