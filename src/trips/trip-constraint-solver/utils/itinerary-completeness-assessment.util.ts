import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import type { CoverageMapData } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

export interface ItineraryCompletenessSignal {
  kind: 'meal_missing' | 'duplicate_poi' | 'segment_blocked';
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  priority: FeasibilityIssueDto['priority'];
  affectedDays: number[];
  proof: NonNullable<FeasibilityIssueDto['proofs']>[number];
}

export interface ItineraryCompletenessInput {
  tripId: string;
  conflicts: ConflictDto[];
  coverage?: CoverageMapData;
}

export interface ItineraryCompletenessResult {
  score: number;
  signalCount: number;
  issues: FeasibilityIssueDto[];
}

const MEAL_CONFLICTS = new Set<ConflictType>([
  ConflictType.LUNCH_MISSING,
  ConflictType.DINNER_MISSING,
]);

function parseDayNumber(affectedDays?: string[]): number[] {
  if (!affectedDays?.length) return [];
  return affectedDays
    .map((v) => {
      const m = String(v).match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

function priorityFromSeverity(severity: 'high' | 'medium' | 'low'): FeasibilityIssueDto['priority'] {
  if (severity === 'high') return 'suggest_adjust';
  if (severity === 'medium') return 'pending_confirm';
  return 'pending_confirm';
}

function collectSignals(input: ItineraryCompletenessInput): ItineraryCompletenessSignal[] {
  const signals: ItineraryCompletenessSignal[] = [];

  for (const conflict of input.conflicts) {
    if (MEAL_CONFLICTS.has(conflict.type)) {
      signals.push({
        kind: 'meal_missing',
        title: conflict.title,
        message: conflict.description,
        severity: conflict.severity === 'HIGH' ? 'high' : 'medium',
        priority: priorityFromSeverity(conflict.severity === 'HIGH' ? 'high' : 'medium'),
        affectedDays: parseDayNumber(conflict.affectedDays),
        proof: {
          entity: conflict.title,
          constraint: conflict.type,
          currentFact: conflict.description,
          evidenceSource: 'trip.conflicts',
          evidenceType: 'meal_structure',
          conclusion: '建议补充用餐安排或标记为自行解决',
          ruleId: 'itinerary_completeness.meal.missing',
          confidence: 0.85,
        },
      });
      continue;
    }

    if (conflict.type === ConflictType.DUPLICATE_ITEM) {
      signals.push({
        kind: 'duplicate_poi',
        title: conflict.title,
        message: conflict.description,
        severity: conflict.severity === 'HIGH' ? 'high' : 'medium',
        priority: priorityFromSeverity(conflict.severity === 'HIGH' ? 'high' : 'medium'),
        affectedDays: parseDayNumber(conflict.affectedDays),
        proof: {
          entity: conflict.title,
          constraint: conflict.type,
          currentFact: conflict.description,
          evidenceSource: 'trip.conflicts',
          evidenceType: 'duplicate_poi',
          conclusion: '建议合并或移除重复行程项',
          ruleId: 'itinerary_completeness.poi.duplicate',
          confidence: 0.9,
        },
      });
    }
  }

  const blockedSegments = input.coverage?.segments.filter((s) => s.coverageStatus === 'blocked') ?? [];
  for (const segment of blockedSegments.slice(0, 3)) {
    const hazard = segment.hazards[0];
    signals.push({
      kind: 'segment_blocked',
      title: `第${segment.day}天路段不可通行`,
      message: hazard?.message ?? `第${segment.day}天存在 blocked 路段`,
      severity: 'high',
      priority: 'suggest_adjust',
      affectedDays: [segment.day],
      proof: {
        entity: `Day${segment.day} 路段`,
        constraint: 'segment_blocked',
        currentFact: hazard?.message ?? '路段覆盖状态为 blocked',
        evidenceSource: 'readiness.coverage-map',
        evidenceType: 'road_closure',
        conclusion: '关键路段未打通，行程结构不完整',
        ruleId: 'itinerary_completeness.segment.blocked',
        confidence: 0.88,
      },
    });
  }

  return signals;
}

function scoreFromSignals(signals: ItineraryCompletenessSignal[]): number {
  if (signals.length === 0) return 100;
  let score = 100;
  for (const signal of signals) {
    if (signal.kind === 'segment_blocked') score -= 18;
    else if (signal.kind === 'duplicate_poi') score -= 14;
    else score -= 10;
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

function worstPriority(signals: ItineraryCompletenessSignal[]): FeasibilityIssueDto['priority'] {
  if (signals.some((s) => s.priority === 'suggest_adjust')) return 'suggest_adjust';
  if (signals.some((s) => s.priority === 'must_handle')) return 'must_handle';
  return 'pending_confirm';
}

/**
 * 行程结构完整：聚合餐食/重复 POI/阻断路段，输出单条汇总 issue + 多条 proof（不重复创建 conflict issue）。
 */
export function assessItineraryCompleteness(
  input: ItineraryCompletenessInput,
): ItineraryCompletenessResult {
  const signals = collectSignals(input);
  const score = scoreFromSignals(signals);

  if (signals.length === 0) {
    return { score: 100, signalCount: 0, issues: [] };
  }

  const priority = worstPriority(signals);
  const issue: FeasibilityIssueDto = {
    id: `issue-itinerary-completeness-${input.tripId}`,
    priority,
    category: 'itinerary_completeness',
    title: '行程结构完整性',
    message: `发现 ${signals.length} 项结构问题（餐食安排、重复项或阻断路段）`,
    affectedDays: [...new Set(signals.flatMap((s) => s.affectedDays))],
    severity: signals.some((s) => s.severity === 'high') ? 'high' : 'medium',
    issueKind: 'itinerary_structure',
    proofs: signals.map((s) => s.proof),
    actionRequired: '补齐餐食、去重 POI 或调整阻断路段后再验证',
  };

  return {
    score,
    signalCount: signals.length,
    issues: [issue],
  };
}
