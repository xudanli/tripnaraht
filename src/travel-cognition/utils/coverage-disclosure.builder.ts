/**
 * 从覆盖地图 / 决策证据包构建 CoverageDisclosure。
 */

import type { TravelFactType } from '../types/evidence-envelope.types';
import {
  buildDefaultCoverageDisclosure,
  type CoverageDisclosure,
} from '../types/coverage-disclosure.types';

const EVIDENCE_TYPE_TO_FACT: Record<string, TravelFactType> = {
  weather: 'WEATHER',
  road_closure: 'ROAD',
  opening_hours: 'OPENING_HOURS',
  permit: 'SAFETY_ALERT',
};

const RULE_ID_TO_FACT: Record<string, TravelFactType> = {
  drive_safety_v1: 'WEATHER',
  precipitation_limit_v1: 'WEATHER',
  snow_depth_limit_v1: 'WEATHER',
  solar_safety_v1: 'SAFETY_ALERT',
  temporal_opening_v1: 'OPENING_HOURS',
  public_transport_v1: 'TRANSPORT_TIME',
  rail_safety_v1: 'TRANSPORT_TIME',
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function appendFactTypes(target: TravelFactType[], additions: TravelFactType[]): void {
  for (const item of additions) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

export interface CoverageMapDisclosureInput {
  pois?: Array<{
    evidenceTypes?: string[];
    metadata?: Record<string, unknown>;
  }>;
  segments?: Array<{ hazards?: Array<{ type?: string }> }>;
  dataFreshness?: {
    weather?: string;
    roadClosure?: string;
    openingHours?: string;
  };
}

export function buildCoverageDisclosureFromCoverageMap(
  coverage: CoverageMapDisclosureInput,
  locale: 'zh' | 'en' = 'zh',
): CoverageDisclosure {
  const coveredFactTypes: TravelFactType[] = [];
  const sourcesUsed: string[] = [];

  for (const poi of coverage.pois ?? []) {
    for (const evidenceType of poi.evidenceTypes ?? []) {
      const mapped = EVIDENCE_TYPE_TO_FACT[evidenceType];
      if (mapped) {
        appendFactTypes(coveredFactTypes, [mapped]);
      }
    }
    const meta = poi.metadata ?? {};
    const dataSource = meta.data_source ?? meta.dataSource;
    if (typeof dataSource === 'string' && dataSource.trim()) {
      sourcesUsed.push(dataSource.trim());
    }
  }

  if (coverage.dataFreshness?.weather) {
    appendFactTypes(coveredFactTypes, ['WEATHER']);
    sourcesUsed.push('weather');
  }
  if (coverage.dataFreshness?.roadClosure) {
    appendFactTypes(coveredFactTypes, ['ROAD']);
    sourcesUsed.push('road.is');
  }
  if (coverage.dataFreshness?.openingHours) {
    appendFactTypes(coveredFactTypes, ['OPENING_HOURS']);
    sourcesUsed.push('opening_hours');
  }

  const hasRoadHazard = (coverage.segments ?? []).some((segment) =>
    (segment.hazards ?? []).some((h) => h.type === 'road_closure'),
  );
  if (hasRoadHazard) {
    appendFactTypes(coveredFactTypes, ['ROAD']);
  }

  return buildDefaultCoverageDisclosure({
    coveredFactTypes:
      coveredFactTypes.length > 0
        ? coveredFactTypes
        : ['WEATHER', 'ROAD', 'OPENING_HOURS'],
    sourcesUsed: unique(sourcesUsed),
    locale,
  });
}

export interface RouteAndRunEvidenceDisclosureInput {
  evidenceBundle?: {
    sources?: Array<{ type?: string; label?: string }>;
    hard_facts?: Array<{ rule_id?: string }>;
  } | null;
  locale?: 'zh' | 'en';
}

export function buildCoverageDisclosureFromRouteAndRunEvidence(
  input: RouteAndRunEvidenceDisclosureInput,
): CoverageDisclosure {
  const coveredFactTypes: TravelFactType[] = [];
  const sourcesUsed: string[] = [];

  for (const source of input.evidenceBundle?.sources ?? []) {
    const type = String(source.type ?? '').toUpperCase();
    if (type.includes('OPENING')) {
      appendFactTypes(coveredFactTypes, ['OPENING_HOURS']);
    }
    if (type.includes('WEATHER') || type.includes('HARD_RULE')) {
      appendFactTypes(coveredFactTypes, ['WEATHER']);
    }
    if (source.label?.trim()) {
      sourcesUsed.push(source.label.trim());
    } else if (source.type?.trim()) {
      sourcesUsed.push(source.type.trim());
    }
  }

  for (const fact of input.evidenceBundle?.hard_facts ?? []) {
    const ruleId = String(fact.rule_id ?? '').trim();
    if (!ruleId) continue;
    const mapped = RULE_ID_TO_FACT[ruleId];
    if (mapped) {
      appendFactTypes(coveredFactTypes, [mapped]);
    }
    sourcesUsed.push(ruleId);
  }

  return buildDefaultCoverageDisclosure({
    coveredFactTypes:
      coveredFactTypes.length > 0
        ? coveredFactTypes
        : ['WEATHER', 'ROAD', 'OPENING_HOURS', 'TRANSPORT_TIME'],
    sourcesUsed: unique(sourcesUsed),
    locale: input.locale ?? 'zh',
  });
}
