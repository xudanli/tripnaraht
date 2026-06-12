import type { SparseRegionProfile } from '../types/open-world-poi.types';

export const SPARSE_REGION_PROFILES: Record<'greenland' | 'svalbard', SparseRegionProfile> = {
  greenland: {
    profileId: 'sparse_polar_greenland',
    regionTag: 'greenland',
    minPoiRequired: 0,
    minDbCandidatesThreshold: 0,
    allowElasticNodes: true,
    freezeFillMissingSlots: true,
    defaultDayAllocation: 'intentional_slack',
    slackSlotTemplate: {
      minMinutes: 120,
      maxMinutes: 240,
      defaultReasonCode: 'WEATHER_WINDOW',
    },
  },
  svalbard: {
    profileId: 'sparse_polar_svalbard',
    regionTag: 'svalbard',
    minPoiRequired: 0,
    minDbCandidatesThreshold: 0,
    allowElasticNodes: true,
    freezeFillMissingSlots: true,
    defaultDayAllocation: 'intentional_slack',
    slackSlotTemplate: {
      minMinutes: 120,
      maxMinutes: 240,
      defaultReasonCode: 'SAFETY_BUFFER',
    },
  },
};

export interface ResolveSparseRegionProfileInput {
  countryCode?: string;
  destinationHint?: string;
  regionTags?: string[];
}

const GREENLAND_RE =
  /格陵兰|greenland|\bnuuk\b|\bdisko\b|伊卢利萨特|ilulissat|康克鲁斯瓦格|kangerlussuaq/i;
const SVALBARD_RE =
  /斯瓦尔巴|svalbard|朗伊尔|longyearbyen|北极熊|polar\s+bear|北极|arctic/i;

/** 从国家码 / 文案 / regionTags 解析极地稀疏 profile；未命中返回 null */
export function resolveSparseRegionProfile(
  input: ResolveSparseRegionProfileInput,
): SparseRegionProfile | null {
  const cc = String(input.countryCode ?? '').toUpperCase();
  const hint = String(input.destinationHint ?? '').trim();
  const tags = new Set((input.regionTags ?? []).map((t) => t.toLowerCase()));

  if (cc === 'GL' || tags.has('greenland') || /^gl$/i.test(hint) || GREENLAND_RE.test(hint)) {
    return SPARSE_REGION_PROFILES.greenland;
  }
  if (cc === 'SJ' || tags.has('svalbard') || /^sj$/i.test(hint) || SVALBARD_RE.test(hint)) {
    return SPARSE_REGION_PROFILES.svalbard;
  }
  return null;
}

export function resolvePoiSelectionMinRequired(input: ResolveSparseRegionProfileInput): {
  minPoiRequired: number;
  sparseProfile: SparseRegionProfile | null;
} {
  const sparseProfile = resolveSparseRegionProfile(input);
  return {
    minPoiRequired: sparseProfile?.minPoiRequired ?? 2,
    sparseProfile,
  };
}
