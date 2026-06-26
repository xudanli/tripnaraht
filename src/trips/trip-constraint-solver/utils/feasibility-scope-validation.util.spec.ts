import {
  applyScopeToReport,
  filterReadinessByDay,
} from './feasibility-scope-validation.util';
import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';

describe('feasibility-scope-validation', () => {
  const baseReport: TripFeasibilityReportDto = {
    tripId: 'trip-1',
    tripTitle: 'Test',
    verdict: { status: 'ADJUST_REQUIRED', headline: '需调整' },
    overallScore: 72,
    currentTripVersion: '3',
    isStale: false,
    canStartExecute: false,
    verifiedAt: '2026-06-20T00:00:00.000Z',
    dimensions: [
      { key: 'schedule', label: '日程', score: 60, statusLabel: '1项阻塞', issueCount: 1, blockerCount: 1 },
      { key: 'transport', label: '交通', score: 80, statusLabel: '正常', issueCount: 0, blockerCount: 0 },
      { key: 'booking', label: '预订', score: 70, statusLabel: '正常', issueCount: 0, blockerCount: 0 },
      { key: 'environment', label: '环境', score: 90, statusLabel: '正常', issueCount: 0, blockerCount: 0 },
    ],
    dayTimeline: [
      { dayNumber: 1, tripDayId: 'd1', status: 'blocked', summary: '冲突', issueIds: ['issue-a'] },
      { dayNumber: 2, tripDayId: 'd2', status: 'ok', summary: null, issueIds: [] },
    ],
    issues: [
      {
        id: 'issue-a',
        priority: 'must_handle',
        category: 'schedule',
        title: 'Day1 冲突',
        message: 'Day1 冲突',
        affectedDays: [1],
        severity: 'high',
      },
      {
        id: 'issue-b',
        priority: 'suggest_adjust',
        category: 'booking',
        title: 'Day2 缺口',
        message: 'Day2 缺口',
        affectedDays: [2],
        severity: 'medium',
      },
    ],
    alternatives: [],
    summary: { mustHandle: 1, suggestAdjust: 1, pendingConfirm: 0, blockers: 1 },
  };

  it('filters report to a single day and recalculates verdict', () => {
    const scoped = applyScopeToReport(baseReport, { type: 'day', dayNumber: 1 });
    expect(scoped.issues).toHaveLength(1);
    expect(scoped.issues[0].id).toBe('issue-a');
    expect(scoped.verdict.status).toBe('NOT_EXECUTABLE');
    expect(scoped.dayTimeline).toHaveLength(1);
    expect(scoped.summary.mustHandle).toBe(1);
  });

  it('marks scoped day as executable when no issues in scope', () => {
    const scoped = applyScopeToReport(baseReport, { type: 'day', dayNumber: 2 });
    expect(scoped.issues).toHaveLength(1);
    expect(scoped.verdict.status).toBe('ADJUST_REQUIRED');
    expect(scoped.overallScore).toBeGreaterThan(0);
  });

  it('filterReadinessByDay keeps findings affecting the day', () => {
    const readiness = filterReadinessByDay(
      {
        tripId: 'trip-1',
        score: {
          overall: 70,
          evidenceCoverage: 70,
          scheduleFeasibility: 70,
          transportCertainty: 70,
          safetyRisk: 70,
          buffers: 70,
        },
        findings: [
          { id: 'f1', type: 'blocker', category: 'schedule', message: 'd1', severity: 'high', affectedDays: [1] },
          { id: 'f2', type: 'should', category: 'booking', message: 'd2', severity: 'low', affectedDays: [2] },
        ],
        risks: [],
        summary: {
          totalFindings: 2,
          blockers: 1,
          must: 0,
          should: 1,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: new Date().toISOString(),
      },
      1,
    );
    expect(readiness.findings).toHaveLength(1);
    expect(readiness.findings[0].id).toBe('f1');
  });
});
