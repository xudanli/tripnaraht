import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  enrichFeasibilityIssuesWithResolution,
  filterIssuesForDecisionEscalation,
  inferFeasibilityResolutionMode,
  resolveFeasibilityIssueResolution,
} from './feasibility-resolution-mode.util';

function issue(partial: Partial<FeasibilityIssueDto> & Pick<FeasibilityIssueDto, 'id' | 'message'>): FeasibilityIssueDto {
  return {
    priority: 'suggest_adjust',
    category: 'schedule',
    title: partial.message.slice(0, 40),
    affectedDays: [1],
    severity: 'medium',
    ...partial,
    message: partial.message,
    id: partial.id,
  };
}

describe('feasibility-resolution-mode.util', () => {
  it('classifies missing lunch as DIRECT_EDIT', () => {
    const mode = inferFeasibilityResolutionMode(
      issue({
        id: 'conflict-lunch-1',
        category: 'itinerary_completeness',
        issueKind: 'itinerary_structure',
        message: '第2天未安排午餐',
        proofs: [
          {
            entity: 'Day2',
            constraint: 'LUNCH_MISSING',
            currentFact: '无午餐活动',
            evidenceSource: 'trip.conflicts',
            evidenceType: 'meal_structure',
            conclusion: '建议补充用餐',
          },
        ],
      }),
    );
    expect(mode).toBe('DIRECT_EDIT');
  });

  it('classifies coverage gap as EVIDENCE_REFRESH without decision link', () => {
    const resolved = resolveFeasibilityIssueResolution(
      issue({
        id: 'coverage-gap:poi-1',
        message: '第1天 · 哈尔格林姆斯教堂：缺少证据覆盖',
        proofs: [
          {
            entity: '哈尔格林姆斯教堂',
            constraint: 'opening_hours',
            currentFact: '开放时间未确认',
            evidenceSource: 'readiness.coverage',
            evidenceType: 'coverage-gap',
            conclusion: '待补充证据',
          },
        ],
      }),
    );
    expect(resolved.resolutionMode).toBe('EVIDENCE_REFRESH');
    expect(resolved.linkedDecisionProblemId).toBeNull();
  });

  it('classifies team_fit as COLLABORATION', () => {
    expect(
      inferFeasibilityResolutionMode(
        issue({
          id: 'issue-team-1',
          category: 'team_fit',
          message: '团队画像完成度低',
        }),
      ),
    ).toBe('COLLABORATION');
  });

  it('classifies single-option meal_late as AUTO_FIX', () => {
    const resolved = resolveFeasibilityIssueResolution(
      issue({
        id: 'issue-meal-late',
        semanticKey: 'plan_object_meal_late_arrival_po_1',
        issueKind: 'meal_late',
        message: '午餐窗冲突 15 分钟',
        repairOptions: [
          { id: 'shift_meal_later', label: '顺延午餐', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
    );
    expect(resolved.resolutionMode).toBe('AUTO_FIX');
    expect(resolved.linkedDecisionProblemId).toBeNull();
  });

  it('escalates multi-option poi_access to DECISION_REQUIRED with stable link', () => {
    const resolved = resolveFeasibilityIssueResolution(
      issue({
        id: 'issue-poi-access-1',
        issueKind: 'poi_access_blocked',
        priority: 'must_handle',
        severity: 'high',
        message: '雷尼斯黑沙滩准入不确定',
        repairOptions: [
          { id: 'planb_a', label: '改路线 A', type: 'plan_b' } as FeasibilityIssueDto['repairOptions'][number],
          { id: 'planb_b', label: '改路线 B', type: 'plan_b' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
    );
    expect(resolved.resolutionMode).toBe('DECISION_REQUIRED');
    expect(resolved.linkedDecisionProblemId).toMatch(/^dp_/);
    expect(resolved.escalationReason).toContain('多方案');
  });

  it('filterIssuesForDecisionEscalation excludes DIRECT_EDIT and COLLABORATION', () => {
    const issues = enrichFeasibilityIssuesWithResolution([
      issue({
        id: 'coverage-gap:x',
        message: '缺少开放时间',
        proofs: [{ entity: 'x', constraint: 'oh', currentFact: 'x', evidenceSource: 'r', evidenceType: 'coverage-gap', conclusion: 'c' }],
      }),
      issue({
        id: 'issue-team',
        category: 'team_fit',
        message: '预算分歧',
      }),
      issue({
        id: 'issue-drive',
        issueKind: 'daily_drive',
        priority: 'must_handle',
        severity: 'high',
        message: '驾驶超限',
        repairOptions: [
          { id: 'lodging_a', label: '换住宿 A', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
          { id: 'lodging_b', label: '换住宿 B', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
    ]);

    const escalated = filterIssuesForDecisionEscalation(issues);
    expect(escalated.map((i) => i.id)).toEqual(['issue-drive']);
  });
});
