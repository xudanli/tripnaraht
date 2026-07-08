import {
  computeFeasibilityScoreFromConflicts,
  computePaceScoreFromMetrics,
  computePlanningProgress,
  itemNeedsBooking,
  parseTimelineOverviewInclude,
  PENDING_BOOKING_STATUSES,
} from './timeline-overview.util';
import { ConflictSeverity } from '../dto/trip-conflicts.dto';
import { PipelineStageStatus } from '../dto/pipeline-status.dto';

describe('timeline-overview.util', () => {
  it('defaults exclude suggestions list (stats.newSuggestionCount still populated)', () => {
    const include = parseTimelineOverviewInclude();
    expect(include.has('stats')).toBe(true);
    expect(include.has('suggestions')).toBe(false);
  });

  it('computes feasibility from conflict severities', () => {
    const score = computeFeasibilityScoreFromConflicts([
      {
        id: '1',
        type: 'TIME_CONFLICT' as never,
        severity: ConflictSeverity.HIGH,
        title: 't',
        description: 'd',
        affectedDays: [],
        affectedItemIds: [],
      },
      {
        id: '2',
        type: 'FATIGUE_EXCEEDED' as never,
        severity: ConflictSeverity.MEDIUM,
        title: 't',
        description: 'd',
        affectedDays: [],
        affectedItemIds: [],
      },
    ]);
    expect(score).toBe(60);
  });

  it('computes pace from average fatigue', () => {
    const score = computePaceScoreFromMetrics({
      tripId: 't1',
      days: [
        { date: '2026-07-01', metrics: { fatigue: 30 } as never, conflicts: [] },
        { date: '2026-07-02', metrics: { fatigue: 50 } as never, conflicts: [] },
      ],
      summary: {
        totalWalk: 0,
        totalDrive: 0,
        totalBuffer: 0,
        totalFatigue: 80,
        totalCost: 0,
        averageWalkPerDay: 0,
        averageDrivePerDay: 0,
      },
    });
    expect(score).toBe(60);
  });

  it('computes planning progress from pipeline stages', () => {
    const progress = computePlanningProgress([
      { id: '1', name: 'A', status: PipelineStageStatus.COMPLETED },
      { id: '2', name: 'B', status: PipelineStageStatus.IN_PROGRESS },
      { id: '3', name: 'C', status: PipelineStageStatus.PENDING },
    ]);
    expect(progress.completedStages).toBe(1);
    expect(progress.totalStages).toBe(3);
    expect(progress.progressPercent).toBe(33);
    expect(progress.currentStageName).toBe('B');
  });

  it('detects items needing booking', () => {
    expect(itemNeedsBooking('ACCOMMODATION')).toBe(true);
    expect(itemNeedsBooking('NOTE')).toBe(false);
    expect(PENDING_BOOKING_STATUSES.has('NEED_BOOKING')).toBe(true);
  });
});
