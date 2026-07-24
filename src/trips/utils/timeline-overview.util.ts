import { PipelineStageDto, PipelineStageStatus } from '../dto/pipeline-status.dto';
import { ConflictDto, ConflictSeverity } from '../dto/trip-conflicts.dto';
import type { TripMetricsResponseDto } from '../dto/trip-metrics.dto';
import type { TripHealth } from '../../skills/detail/shared/detail-state.types';

export function parseTimelineOverviewInclude(raw?: string): Set<string> {
  const defaults = ['stats', 'pipeline', 'tasks', 'reminders', 'readiness'];
  if (!raw?.trim()) return new Set(defaults);
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (token) out.add(token);
  }
  return out.size > 0 ? out : new Set(defaults);
}

export function computeFeasibilityScoreFromConflicts(conflicts: ConflictDto[]): number {
  if (conflicts.length === 0) return 100;
  const penalty = conflicts.reduce((sum, conflict) => {
    if (conflict.severity === ConflictSeverity.HIGH) return sum + 25;
    if (conflict.severity === ConflictSeverity.MEDIUM) return sum + 15;
    return sum + 5;
  }, 0);
  return Math.max(0, 100 - Math.min(penalty, 95));
}

export function computePaceScoreFromMetrics(metrics: TripMetricsResponseDto): number {
  const dayCount = Math.max(metrics.days.length, 1);
  const avgFatigue = metrics.summary.totalFatigue / dayCount;
  return Math.round(Math.max(0, Math.min(100, 100 - avgFatigue)));
}

export function computePlanningProgress(stages: PipelineStageDto[]): {
  progressPercent: number;
  completedStages: number;
  totalStages: number;
  currentStageName?: string;
} {
  const totalStages = stages.length || 1;
  let completedStages = 0;
  let currentStageName: string | undefined;

  for (const stage of stages) {
    if (stage.status === PipelineStageStatus.COMPLETED) {
      completedStages += 1;
    } else if (
      !currentStageName &&
      (stage.status === PipelineStageStatus.IN_PROGRESS ||
        stage.status === PipelineStageStatus.RISK)
    ) {
      currentStageName = stage.name;
    }
  }

  if (!currentStageName) {
    const pending = stages.find((s) => s.status === PipelineStageStatus.PENDING);
    if (pending) currentStageName = pending.name;
  }

  const progressPercent = Math.round((completedStages / totalStages) * 100);
  return { progressPercent, completedStages, totalStages, currentStageName };
}

export function buildHealthSnapshot(
  feasibilityScore: number,
  paceScore: number,
  conflictCount: number,
): TripHealth {
  const dimensions = {
    schedule: scoreToDimension(
      Math.max(0, 100 - Math.min(conflictCount * 15, 90)),
      conflictCount > 0 ? [`${conflictCount} 项日程冲突`] : [],
    ),
    budget: scoreToDimension(100, []),
    pace: scoreToDimension(paceScore, paceScore < 70 ? ['节奏偏紧'] : []),
    feasibility: scoreToDimension(feasibilityScore, feasibilityScore < 70 ? ['可行性需关注'] : []),
  };

  const overallScore = Math.round(
    dimensions.schedule.score * 0.3 +
      dimensions.budget.score * 0.25 +
      dimensions.pace.score * 0.25 +
      dimensions.feasibility.score * 0.2,
  );

  let overall: TripHealth['overall'] = 'healthy';
  if (overallScore < 50) overall = 'critical';
  else if (overallScore < 70) overall = 'warning';

  return { overall, overallScore, dimensions };
}

function scoreToDimension(
  score: number,
  issues: string[],
): TripHealth['dimensions']['schedule'] {
  const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
  return { status, score, issues };
}

export const PENDING_BOOKING_STATUSES = new Set([
  'NEED_BOOKING',
  'PENDING',
  'UNBOOKED',
]);

export const CONFIRMED_BOOKING_STATUSES = new Set([
  'BOOKED',
  'CONFIRMED',
  'COMPLETED',
]);

export function itemNeedsBooking(type: string | null | undefined): boolean {
  if (!type) return false;
  const normalized = type.toUpperCase();
  return ['ACCOMMODATION', 'ACTIVITY', 'TRANSPORT', 'FLIGHT', 'TRAIN', 'FERRY'].includes(
    normalized,
  );
}
