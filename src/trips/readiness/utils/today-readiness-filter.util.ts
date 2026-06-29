import type { CoverageMapData } from '../types/coverage-map.types';
import type { ReadinessScoreFinding, ReadinessScoreRisk } from '../types/coverage-map.types';
import { DateTime } from 'luxon';

export function resolveTripDayNumber(startDate: Date, endDate: Date): number {
  const start = DateTime.fromJSDate(startDate).startOf('day');
  const end = DateTime.fromJSDate(endDate).startOf('day');
  const now = DateTime.now().startOf('day');
  if (now < start) return 1;
  if (now > end) {
    return Math.max(1, Math.ceil(end.diff(start, 'days').days) + 1);
  }
  return Math.max(1, Math.floor(now.diff(start, 'days').days) + 1);
}

export function filterCoverageMapForDay(
  data: CoverageMapData,
  dayNumber: number,
): CoverageMapData {
  const pois = data.pois.filter((p) => p.day === dayNumber);
  const poiIds = new Set(pois.map((p) => p.id));

  const segments = data.segments.filter((segment) => segment.day === dayNumber);

  const segmentIds = new Set(segments.map((s) => s.id));

  const gaps = data.gaps.filter((gap) => {
    if (gap.affectedDays?.includes(dayNumber)) return true;
    if (gap.type === 'poi' && poiIds.has(gap.relatedId)) return true;
    if (gap.type === 'segment' && segmentIds.has(gap.relatedId)) return true;
    return false;
  });

  const coveredPois = pois.filter((p) => p.coverageStatus === 'covered').length;
  const partialPois = pois.filter((p) => p.coverageStatus === 'partial').length;
  const uncoveredPois = pois.filter((p) => p.coverageStatus === 'uncovered').length;
  const coveredSegments = segments.filter((s) => s.coverageStatus === 'covered').length;
  const warningSegments = segments.filter((s) => s.coverageStatus === 'warning').length;
  const blockedSegments = segments.filter((s) => s.coverageStatus === 'blocked').length;
  const totalItems = pois.length + segments.length;
  const coveredScore = coveredPois + partialPois * 0.5 + coveredSegments + warningSegments * 0.5;

  return {
    ...data,
    pois,
    segments,
    gaps,
    summary: {
      ...data.summary,
      totalPois: pois.length,
      coveredPois,
      partialPois,
      uncoveredPois,
      totalSegments: segments.length,
      coveredSegments,
      warningSegments,
      blockedSegments,
      totalGaps: gaps.length,
      coverageRate: totalItems > 0 ? Math.round((coveredScore / totalItems) * 100) / 100 : 0,
    },
  };
}

export function findingAppliesToDay(finding: ReadinessScoreFinding, dayNumber: number): boolean {
  if (finding.affectedDays?.includes(dayNumber)) return true;
  if (finding.tripScope?.day === dayNumber) return true;
  if (finding.message.includes(`第${dayNumber}天`)) return true;
  // 路段/证据类无 day 标记时不计入「今日就绪」（避免整趟签证/打包项）
  if (finding.category === 'readiness' && !finding.affectedDays?.length && !finding.tripScope) {
    return false;
  }
  return false;
}

export function riskAppliesToDay(
  risk: ReadinessScoreRisk,
  dayCoverage: CoverageMapData,
): boolean {
  if (!risk.affectedPois?.length) return false;
  const dayPoiIds = new Set(dayCoverage.pois.map((p) => p.id));
  return risk.affectedPois.some((id) => dayPoiIds.has(id));
}

export function deriveTodayReadinessStatus(
  blockers: number,
  must: number,
  overall: number,
): 'block' | 'warn' | 'pass' {
  if (blockers > 0) return 'block';
  if (must > 0 || overall < 70) return 'warn';
  return 'pass';
}
