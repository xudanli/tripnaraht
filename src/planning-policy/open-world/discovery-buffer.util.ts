import type {
  OpenWorldDiscoveryResult,
  OpenWorldMention,
  OpenWorldPoiStub,
} from '../types/open-world-poi.types';
import { resolveSparseRegionProfile } from '../profiles/sparse-region.profile';
import { buildDefaultPolarRegionStubs } from './polar-region-stubs.util';
import { buildOpenWorldPoiStub } from './open-world-poi-stub.util';
import { openWorldStubsToPoiEvidence } from './open-world-poi-stub.util';

interface MentionPattern {
  id: string;
  re: RegExp;
  displayName: string;
  regionHint: string;
  activityKind: string;
  lat: number;
  lng: number;
  constraintTags: OpenWorldPoiStub['constraintTags'];
  elasticMinutes: { min: number; max: number };
}

const POLAR_MENTION_PATTERNS: MentionPattern[] = [
  {
    id: 'disco_kayak',
    re: /迪斯科湾.{0,16}皮划艇|disko.{0,24}kayak|kayak.{0,24}(?:iceberg|冰山)|皮划艇.{0,12}冰山/i,
    displayName: '迪斯科湾皮划艇看冰山（待核实）',
    regionHint: 'Disko Bay, Greenland',
    activityKind: 'kayak_iceberg',
    lat: 69.2198,
    lng: -51.0986,
    constraintTags: ['guide_required', 'weather_window', 'permit_required'],
    elasticMinutes: { min: 180, max: 240 },
  },
  {
    id: 'aurora_window',
    re: /极光.{0,12}(?:窗|等待|观测)|northern\s+lights|aurora.{0,12}(?:window|watch)/i,
    displayName: '极光天气窗等待（弹性）',
    regionHint: 'Longyearbyen, Svalbard',
    activityKind: 'aurora_window',
    lat: 78.2232,
    lng: 15.6267,
    constraintTags: ['weather_window'],
    elasticMinutes: { min: 120, max: 240 },
  },
  {
    id: 'snowmobile_expedition',
    re: /雪地摩托|snowmobile|雪车远征|expedition.{0,12}snow/i,
    displayName: '雪地摩托远征（弹性）',
    regionHint: 'Svalbard',
    activityKind: 'snowmobile',
    lat: 78.2232,
    lng: 15.6267,
    constraintTags: ['guide_required', 'weather_window', 'expedition_flexible'],
    elasticMinutes: { min: 120, max: 240 },
  },
  {
    id: 'bear_safety_buffer',
    re: /防熊|polar\s+bear|熊区|携带武器|guide\s+required/i,
    displayName: '防熊区安全缓冲',
    regionHint: 'Svalbard',
    activityKind: 'bear_buffer',
    lat: 78.2232,
    lng: 15.6267,
    constraintTags: ['bear_zone_buffer', 'guide_required'],
    elasticMinutes: { min: 120, max: 240 },
  },
  {
    id: 'expedition_flex',
    re: /远征|expedition|临时集结|weather\s+window|天气窗/i,
    displayName: '远征/天气窗弹性时段',
    regionHint: 'Arctic',
    activityKind: 'expedition_flex',
    lat: 78.2232,
    lng: 15.6267,
    constraintTags: ['weather_window', 'expedition_flexible'],
    elasticMinutes: { min: 120, max: 240 },
  },
];

function normalizeHay(pois: unknown[]): string {
  return pois
    .map((p) => {
      if (!p || typeof p !== 'object') return '';
      const o = p as Record<string, unknown>;
      return [o.name, o.nameCN, o.nameEN, o.displayName].filter(Boolean).join(' ');
    })
    .join(' ')
    .toLowerCase();
}

function mentionAlreadyGrounded(mention: OpenWorldMention, poiHay: string): boolean {
  const tokens = mention.displayName
    .replace(/（.*?）/g, '')
    .split(/[\s/、，]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  const hitCount = tokens.filter((t) => poiHay.includes(t)).length;
  return hitCount >= Math.min(2, tokens.length);
}

export function extractOpenWorldMentionsFromText(text: string): OpenWorldMention[] {
  const t = String(text ?? '').trim();
  if (!t) return [];

  const mentions: OpenWorldMention[] = [];
  const seen = new Set<string>();

  for (const pattern of POLAR_MENTION_PATTERNS) {
    const m = t.match(pattern.re);
    if (!m?.[0] || seen.has(pattern.id)) continue;
    seen.add(pattern.id);
    mentions.push({
      mentionId: `mention_${pattern.id}`,
      rawText: m[0],
      displayName: pattern.displayName,
      regionHint: pattern.regionHint,
      activityKind: pattern.activityKind,
      confidence: 0.85,
    });
  }

  return mentions;
}

function stubFromMention(pattern: MentionPattern, mention: OpenWorldMention): OpenWorldPoiStub {
  return buildOpenWorldPoiStub({
    stubId: `provisional_${pattern.id}`,
    displayName: mention.displayName,
    regionHint: mention.regionHint,
    lat: pattern.lat,
    lng: pattern.lng,
    constraintTags: pattern.constraintTags,
    elasticMinutes: pattern.elasticMinutes,
    source: 'user_mention',
    status: 'verification_pending',
  });
}

function patternForMention(mention: OpenWorldMention): MentionPattern | undefined {
  return POLAR_MENTION_PATTERNS.find((p) => mention.mentionId === `mention_${p.id}`);
}

const REGION_CENTERS: Record<string, { lat: number; lng: number }> = {
  greenland: { lat: 64.1814, lng: -51.6941 },
  svalbard: { lat: 78.2232, lng: 15.6267 },
  'disko bay': { lat: 69.2198, lng: -51.0986 },
  longyearbyen: { lat: 78.2232, lng: 15.6267 },
  nuuk: { lat: 64.1814, lng: -51.6941 },
};

function resolveCoarseLatLng(regionHint: string, regionTag?: string): { lat: number; lng: number } {
  const hay = `${regionHint} ${regionTag ?? ''}`.toLowerCase();
  for (const [key, loc] of Object.entries(REGION_CENTERS)) {
    if (hay.includes(key)) return loc;
  }
  if (regionTag === 'greenland') return REGION_CENTERS.greenland;
  if (regionTag === 'svalbard') return REGION_CENTERS.svalbard;
  return { lat: 78.2232, lng: 15.6267 };
}

export function mergeOpenWorldMentionLists(...lists: OpenWorldMention[][]): OpenWorldMention[] {
  const out: OpenWorldMention[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const m of list) {
      const key = `${m.activityKind}|${m.displayName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function stubFromOpenWorldMention(
  mention: OpenWorldMention,
  regionTag?: 'greenland' | 'svalbard',
): OpenWorldPoiStub {
  const pattern = patternForMention(mention);
  if (pattern) return stubFromMention(pattern, mention);
  const loc = resolveCoarseLatLng(mention.regionHint, regionTag);
  return buildOpenWorldPoiStub({
    stubId: `provisional_${mention.mentionId.replace(/^mention_/, '')}`,
    displayName: mention.displayName,
    regionHint: mention.regionHint,
    lat: loc.lat,
    lng: loc.lng,
    constraintTags: ['weather_window', 'guide_required'],
    elasticMinutes: { min: 120, max: 240 },
    source: mention.mentionId.includes('llm') ? 'llm_rag' : 'user_mention',
    status: 'verification_pending',
  });
}

export interface RunOpenWorldDiscoveryBufferInput {
  userMessage: string;
  countryCode?: string;
  destinationHint?: string;
  regionTags?: string[];
  existingPoiEvidence?: unknown[];
  /** 已注入 stubId，避免重复 */
  existingStubIds?: string[];
  /** LLM / 外部抽取的 mention（与规则 mention 合并） */
  extraMentions?: OpenWorldMention[];
}

/** L1 Discovery Buffer：从用户话术提取未落地 mention → provisional stub */
export function runOpenWorldDiscoveryBuffer(
  input: RunOpenWorldDiscoveryBufferInput,
): OpenWorldDiscoveryResult {
  const sparseProfile = resolveSparseRegionProfile({
    countryCode: input.countryCode,
    destinationHint: `${input.destinationHint ?? ''} ${input.userMessage}`,
    regionTags: input.regionTags,
  });

  const poiHay = normalizeHay(input.existingPoiEvidence ?? []);
  const existingStubIds = new Set(input.existingStubIds ?? []);
  const mentions = mergeOpenWorldMentionLists(
    extractOpenWorldMentionsFromText(input.userMessage),
    input.extraMentions ?? [],
  );
  const regionTag = sparseProfile?.regionTag;

  const stubs: OpenWorldPoiStub[] = [];
  let skippedGroundedCount = 0;

  for (const mention of mentions) {
    if (mentionAlreadyGrounded(mention, poiHay)) {
      skippedGroundedCount += 1;
      continue;
    }
    const stub = stubFromOpenWorldMention(mention, regionTag);
    if (existingStubIds.has(stub.stubId)) continue;
    stubs.push(stub);
    existingStubIds.add(stub.stubId);
  }

  if (sparseProfile && stubs.length === 0 && mentions.length === 0) {
    for (const base of buildDefaultPolarRegionStubs(sparseProfile.regionTag, input.userMessage)) {
      if (existingStubIds.has(base.stubId)) continue;
      if (mentionAlreadyGrounded(
        { mentionId: base.stubId, rawText: base.displayName, displayName: base.displayName, regionHint: base.regionHint, activityKind: 'registry', confidence: 0.5 },
        poiHay,
      )) {
        skippedGroundedCount += 1;
        continue;
      }
      stubs.push(base);
    }
  }

  return {
    mentions,
    stubs,
    mergedStubCount: stubs.length,
    skippedGroundedCount,
  };
}

export function mergeDiscoveryStubsIntoPoiEvidence(
  pois: unknown[],
  stubs: OpenWorldPoiStub[],
): unknown[] {
  if (!stubs.length) return pois;
  return openWorldStubsToPoiEvidence(stubs).reduce(
    (acc, stubPoi) => {
      const key = String(stubPoi.poi_id ?? '').toLowerCase();
      const exists = acc.some(
        (p) =>
          String((p as Record<string, unknown>)?.poi_id ?? (p as Record<string, unknown>)?.id ?? '').toLowerCase() === key,
      );
      return exists ? acc : [...acc, stubPoi];
    },
    [...pois],
  );
}
