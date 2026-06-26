import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import { deriveFeasibilityChecklistFromReport } from './feasibility-checklist.util';

function minimalReport(overrides: Partial<TripFeasibilityReportDto> = {}): TripFeasibilityReportDto {
  return {
    tripId: 'trip-1',
    overallScore: 80,
    canStartExecute: false,
    isStale: false,
    phaseHint: '规划阶段',
    verdict: { status: 'ADJUST_REQUIRED', headline: '需调整' },
    summary: {
      mustHandle: 0,
      suggestAdjust: 0,
      pendingConfirm: 0,
      blockers: 0,
    },
    dimensions: [
      { key: 'schedule', label: '日程', score: 80, statusLabel: 'ok', issueCount: 0, blockerCount: 0 },
      { key: 'team_fit', label: '团队', score: 100, statusLabel: 'ok', issueCount: 0, blockerCount: 0 },
    ],
    issues: [],
    dayTimeline: [],
    teamFitSummary: { score: 100, memberCount: 1, profilingCompletedCount: 1 },
    ...overrides,
  } as TripFeasibilityReportDto;
}

describe('feasibility-checklist.util', () => {
  it('marks all checklist items passed for clean report', () => {
    const checklist = deriveFeasibilityChecklistFromReport(minimalReport());
    expect(checklist.schedule.result).toBe('passed');
    expect(checklist.opening_hours.result).toBe('passed');
    expect(checklist.team_fit.result).toBe('passed');
    expect(checklist.weather.result).toBe('passed');
    expect(checklist.booking.result).toBe('passed');
  });

  it('maps schedule issues to pending checklist', () => {
    const checklist = deriveFeasibilityChecklistFromReport(
      minimalReport({
        issues: [
          {
            id: 'issue-1',
            priority: 'suggest_adjust',
            category: 'schedule',
            title: '交通缓冲偏紧',
            message: 'Day 2 缓冲不足',
            affectedDays: [2],
            severity: 'medium',
          },
        ],
      }),
    );
    expect(checklist.schedule).toMatchObject({ result: 'pending', detail: '交通缓冲偏紧' });
  });

  it('defers weather when only pending_confirm and pre-departure phase', () => {
    const checklist = deriveFeasibilityChecklistFromReport(
      minimalReport({
        phaseHint: '出发前规划',
        issues: [
          {
            id: 'weather-1',
            priority: 'pending_confirm',
            category: 'environment',
            title: '大风预警',
            message: 'Day 3 风速偏高',
            affectedDays: [3],
            severity: 'medium',
            proofs: [{ evidenceType: 'weather', entity: 'Day3', constraint: 'wind', currentFact: '风速 18m/s', evidenceSource: 'weather', conclusion: '待确认' }],
          },
        ],
      }),
    );
    expect(checklist.weather).toEqual({ result: 'deferred', detail: '出发前 7 天复查' });
  });

  it('flags booking checklist from booking_confirmation proofs', () => {
    const checklist = deriveFeasibilityChecklistFromReport(
      minimalReport({
        issues: [
          {
            id: 'booking-1',
            priority: 'must_handle',
            category: 'booking',
            title: '缺少预订证据',
            message: '蓝湖温泉未确认预订',
            affectedDays: [1],
            severity: 'high',
            proofs: [
              {
                evidenceType: 'booking_confirmation',
                entity: '蓝湖温泉',
                constraint: 'booking',
                currentFact: '未获取预订确认',
                evidenceSource: 'coverage-map',
                conclusion: '需补充',
              },
            ],
          },
        ],
      }),
    );
    expect(checklist.booking).toMatchObject({ result: 'failed', detail: '缺少预订证据' });
  });
});
