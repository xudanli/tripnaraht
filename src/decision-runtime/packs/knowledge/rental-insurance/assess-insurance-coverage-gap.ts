/**
 * Route Exposure → Coverage Check → Coverage Gap.
 */

import { loadIcelandInsuranceCoverageMatrix } from './iceland-insurance-coverage.loader';
import type {
  CoverageGapItem,
  CoverageStatus,
  InsuranceCoverageDimension,
  InsuranceCoverageGapAssessment,
  InsuranceCoverageTier,
  RouteExposureAssessment,
  RouteExposureCode,
  RouteExposureInput,
} from './iceland-rental-insurance.types';

const EVIDENCE =
  'knowledge/rental-insurance/is-insurance-coverage-matrix.json';

const GAP_STATUSES: CoverageStatus[] = [
  'NOT_COVERED',
  'UNCONFIRMED',
  'EXCLUDED',
];

export function assessRouteExposure(
  input: RouteExposureInput,
): RouteExposureAssessment {
  const codes: RouteExposureCode[] = [];
  const reasons: string[] = [];

  if (input.gravelRoad) {
    codes.push('GRAVEL_ROAD');
    reasons.push('ROUTE_EXPOSURE_GRAVEL_ROAD');
  }
  if (input.gravelParking) {
    codes.push('GRAVEL_PARKING');
    reasons.push('ROUTE_EXPOSURE_GRAVEL_PARKING');
  }
  if (input.windExposed) {
    codes.push('WIND_EXPOSED');
    reasons.push('ROUTE_EXPOSURE_WIND');
  }
  if (input.unpavedSpur) {
    codes.push('UNPAVED_SPUR');
    reasons.push('ROUTE_EXPOSURE_UNPAVED_SPUR');
  }
  if (input.fRoadOrHighland) {
    codes.push('F_ROAD_HIGHLAND');
    reasons.push('ROUTE_EXPOSURE_F_ROAD_HIGHLAND');
  }
  if (input.fordCrossing) {
    codes.push('FORD_CROSSING');
    reasons.push('ROUTE_EXPOSURE_FORD');
  }

  return { codes, reasons };
}

/**
 * Compare route exposure against tier matrix → gaps that need user confirmation.
 */
export function assessInsuranceCoverageGaps(input: {
  exposure: RouteExposureInput;
  tier: InsuranceCoverageTier;
  /** Optional explicit overrides (e.g. user-declared SAAP) — structured only */
  coverageOverrides?: Partial<Record<InsuranceCoverageDimension, CoverageStatus>>;
}): InsuranceCoverageGapAssessment {
  const matrix = loadIcelandInsuranceCoverageMatrix();
  const routeExposure = assessRouteExposure(input.exposure);
  const tierRow = { ...matrix.tiers[input.tier] };
  if (input.coverageOverrides) {
    Object.assign(tierRow, input.coverageOverrides);
  }
  // Hard rule: fording never covered by rental tiers in this pack
  tierRow.WATER_FORDING = 'EXCLUDED';

  const needed = new Map<
    InsuranceCoverageDimension,
    Set<RouteExposureCode>
  >();
  for (const code of routeExposure.codes) {
    const dims = matrix.exposureToDimensions[code] ?? [];
    for (const dim of dims) {
      if (!needed.has(dim)) needed.set(dim, new Set());
      needed.get(dim)!.add(code);
    }
  }

  const gaps: CoverageGapItem[] = [];
  for (const [dimension, triggers] of needed) {
    const status = tierRow[dimension] ?? 'UNCONFIRMED';
    if (!GAP_STATUSES.includes(status)) continue;
    gaps.push({
      dimension,
      status,
      triggeredBy: [...triggers],
      reasonCode:
        status === 'EXCLUDED'
          ? `COVERAGE_EXCLUDED_${dimension}`
          : status === 'NOT_COVERED'
            ? `COVERAGE_MISSING_${dimension}`
            : `COVERAGE_UNCONFIRMED_${dimension}`,
    });
  }

  // Always surface fording exclusion when highland/F-road or ford flagged
  if (
    (input.exposure.fRoadOrHighland || input.exposure.fordCrossing) &&
    !gaps.some((g) => g.dimension === 'WATER_FORDING')
  ) {
    gaps.push({
      dimension: 'WATER_FORDING',
      status: 'EXCLUDED',
      triggeredBy: routeExposure.codes.filter(
        (c) => c === 'F_ROAD_HIGHLAND' || c === 'FORD_CROSSING',
      ),
      reasonCode: 'COVERAGE_EXCLUDED_WATER_FORDING',
    });
  }

  const hasHardGap = gaps.some(
    (g) => g.status === 'NOT_COVERED' || g.status === 'EXCLUDED',
  );
  const hasGap = gaps.length > 0;
  const recommendedActions: string[] = [];
  if (hasGap) {
    recommendedActions.push('CONFIRM_INSURANCE_COVERAGE_GAPS');
    recommendedActions.push('REVIEW_RENTAL_INSURANCE_TIER');
  }
  if (gaps.some((g) => g.dimension === 'WATER_FORDING')) {
    recommendedActions.push('ACK_FORDING_EXCLUSION');
  }
  if (gaps.some((g) => g.dimension === 'GRAVEL_CHIP' && g.status !== 'COVERED')) {
    recommendedActions.push('CONSIDER_GP_OR_HIGHER_TIER');
  }

  return {
    tier: input.tier,
    routeExposure,
    coverageByDimension: tierRow,
    gaps,
    hasHardGap,
    hasGap,
    gate: hasGap ? 'NEED_CONFIRM' : 'ALLOW',
    recommendedActions: [...new Set(recommendedActions)],
    fordingExcluded: true,
    evidencePath: EVIDENCE,
  };
}

/** Pick lowest tier that clears hard gaps (EXCLUDED water still allowed as ack). */
export function recommendInsuranceTier(
  exposure: RouteExposureInput,
): InsuranceCoverageTier {
  const order: InsuranceCoverageTier[] = ['BASIC', 'STANDARD', 'FULL'];
  for (const tier of order) {
    const a = assessInsuranceCoverageGaps({ exposure, tier });
    const blocking = a.gaps.filter(
      (g) =>
        g.status === 'NOT_COVERED' &&
        g.dimension !== 'WATER_FORDING' &&
        g.dimension !== 'DEDUCTIBLE',
    );
    if (blocking.length === 0) return tier;
  }
  return 'FULL';
}

export function formatCoverageGapsSummaryZh(
  assessment: InsuranceCoverageGapAssessment,
): string {
  if (!assessment.routeExposure.codes.length && !assessment.gaps.length) {
    return '路线暴露未标记；请确认基础保险档位。';
  }
  const exposure = assessment.routeExposure.codes.join(', ') || '无';
  const gapLines = assessment.gaps
    .slice(0, 6)
    .map((g) => `${g.dimension}:${g.status}`)
    .join('; ');
  return `路线暴露 [${exposure}] → ${assessment.tier} 缺口 [${gapLines || '无'}]`;
}

export function parseInsuranceCoverageTier(
  raw: unknown,
): InsuranceCoverageTier | undefined {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (s === 'BASIC' || s === 'STANDARD' || s === 'FULL') return s;
  return undefined;
}
