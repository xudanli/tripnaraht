/**
 * Resolve ontology intent refs → user-facing labels (pack-aware).
 */

import { loadRoadRepairTemplatesForCountry } from '../../../decision-runtime/packs/repair/road-repair-template.loader';

const DEFAULT_INTENT_LABELS: Record<string, string> = {
  intent_glacier: '冰川体验',
  intent_waterfall: '瀑布与沿线景观',
  intent_wilderness: '荒野感',
  intent_highland: '高地探索',
  intent_indoor_alternative: '室内备选体验',
  intent_split_overloaded_day: '可完成的日行程节奏',
  intent_coast: '海岸景观',
  intent_photography: '摄影体验',
  intent_black_sand: '黑沙海岸',
};

const CATEGORY_LABELS: Record<string, string> = {
  GLACIER: '冰川体验',
  WATERFALL: '瀑布',
  HIGHLAND: '高地',
  GEOTHERMAL: '地热',
  COAST: '海岸',
};

export function resolveIntentRefLabel(ref: string, countryCode?: string | null): string {
  if (DEFAULT_INTENT_LABELS[ref]) return DEFAULT_INTENT_LABELS[ref];
  const bundle = countryCode ? loadRoadRepairTemplatesForCountry(countryCode) : null;
  if (bundle?.poiIntent) {
    for (const entry of Object.values(bundle.poiIntent)) {
      if (entry.intents.includes(ref)) {
        const cat = entry.categories[0];
        if (cat && CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
      }
    }
  }
  return ref.replace(/^intent_/, '').replace(/_/g, ' ');
}

export function resolveIntentRefLabels(
  refs: string[],
  countryCode?: string | null,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const ref of refs) {
    const label = resolveIntentRefLabel(ref, countryCode);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

export function collectIntentRefsFromProblemContext(input: {
  repairPreservedRefs: string[];
  semanticCapability?: string;
}): string[] {
  const refs = [...input.repairPreservedRefs];
  if (
    input.semanticCapability === 'EXCESSIVE_DAILY_LOAD' &&
    !refs.includes('intent_split_overloaded_day')
  ) {
    refs.push('intent_split_overloaded_day');
  }
  if (
    input.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED' &&
    !refs.some((r) => r.includes('indoor'))
  ) {
    refs.push('intent_indoor_alternative');
  }
  return [...new Set(refs)];
}
