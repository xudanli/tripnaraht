import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import { feasibilityIssueToAssessment } from './feasibility-issue-to-assessment.adapter';

describe('feasibility-issue-to-assessment.adapter', () => {
  const contextVersion = {
    planVersionId: 'plan_rev1',
    policyVersion: 1,
    worldRevision: 'w1',
    rulePackVersion: 'destination.is@1.0.0',
  };

  const dailyDriveIssue: FeasibilityIssueDto = {
    id: 'issue-daily-drive-day2',
    semanticKey: 'EXCESSIVE_DAILY_LOAD:day2',
    priority: 'must_handle',
    category: 'transport',
    title: '每日驾驶时间过长',
    message: 'Day 2 驾驶 6.5h 超过上限',
    affectedDays: [2],
    severity: 'high',
    issueKind: 'daily_drive',
  };

  it('CAS-002: maps must_handle transport issue to BLOCK assessment', () => {
    const a = feasibilityIssueToAssessment(dailyDriveIssue, {
      tripId: 'trip-1',
      evaluationMode: 'PLAN_VERIFY',
      contextVersion,
      evaluatedAt: '2026-07-03T00:00:00.000Z',
      policyRefs: ['c_max_daily_drive'],
    });
    expect(a.assessmentId).toBe('assess_feas_issue-daily-drive-day2');
    expect(a.status).toBe('BLOCK');
    expect(a.semanticKey).toContain('EXCESSIVE_DAILY_LOAD');
    expect(a.policyRefs).toEqual(['c_max_daily_drive']);
    expect(a.semanticsAssertionId).toBe('ca_issue-daily-drive-day2');
  });
});
