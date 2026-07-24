import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';
import {
  assembleFeasibilityReport,
} from './feasibility-assembler.util';
import {
  buildBufferInsufficientRepairOptions,
  isBufferInsufficientConflict,
} from './buffer-insufficient-repair.util';

describe('buffer-insufficient-repair.util', () => {
  it('detects buffer insufficient conflicts', () => {
    expect(
      isBufferInsufficientConflict({
        id: 'buffer-insufficient-a-b',
        type: ConflictType.BUFFER_INSUFFICIENT,
        severity: ConflictSeverity.MEDIUM,
        title: 'x',
        description: 'y',
        affectedDays: ['1'],
        affectedItemIds: ['a', 'b'],
      }),
    ).toBe(true);
  });

  it('builds add_buffer 30/60 as primary repairs', () => {
    const opts = buildBufferInsufficientRepairOptions({
      issueId: 'issue-1',
      toItemId: 'item-b',
      shortfallMinutes: 8,
    });
    expect(opts[0].actionType).toBe('add_buffer');
    expect(opts[0].payload?.bufferMinutes).toBe(30);
    expect(opts[1].payload?.bufferMinutes).toBe(60);
    expect(opts.some((o) => o.actionType === 'shift_departure')).toBe(true);
  });
});

describe('feasibility-assembler buffer_insufficient', () => {
  const baseTrip = {
    id: 'trip-1',
    name: 'demo',
    startDate: new Date('2026-06-20'),
    endDate: new Date('2026-06-25'),
    metadata: {},
  };

  it('syncs BUFFER_INSUFFICIENT into report issues with repair options', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd1', dayNumber: 1 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 70,
          evidenceCoverage: 80,
          scheduleFeasibility: 65,
          transportCertainty: 70,
          safetyRisk: 90,
          buffers: 55,
        },
        findings: [],
        risks: [],
        summary: {
          totalFindings: 0,
          blockers: 0,
          must: 0,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: new Date().toISOString(),
      },
      conflicts: [
        {
          id: 'buffer-insufficient-a-b',
          type: ConflictType.BUFFER_INSUFFICIENT,
          severity: ConflictSeverity.MEDIUM,
          title: '缓冲时间不足',
          description: '仅 8 分钟缓冲',
          affectedDays: ['2'],
          affectedItemIds: ['item-a', 'item-b'],
          fromItemId: 'item-a',
          toItemId: 'item-b',
          fromPlaceLabel: 'A',
          toPlaceLabel: 'B',
          fromDayNumber: 2,
          toDayNumber: 2,
          issueKind: 'buffer_insufficient',
          gapMinutes: 8,
          shortfallMinutes: 7,
          priority: 'suggest_adjust',
        },
      ],
      revision: { revision: 1, revisionLabel: 'V1' },
      snapshot: null,
    });

    const issue = report.issues.find((i) => i.issueKind === 'buffer_insufficient');
    expect(issue).toBeDefined();
    expect(issue?.uiHints?.primaryAction).toBe('add_buffer');
    expect(issue?.repairOptions?.map((o) => o.actionType).slice(0, 4)).toEqual([
      'add_buffer',
      'add_buffer',
      'add_buffer_minutes',
      'shift_departure',
    ]);
  });
});
