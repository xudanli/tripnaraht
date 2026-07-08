import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import {
  buildAssertionFromFeasibilityIssue,
  inferEnforcement,
  inferNatureFromIssue,
  isOverridable,
} from './constraint-semantic.normalizer';
import { adaptFeasibilityIssueToProblem } from './from-feasibility-issue.adapter';
import { normalizeRepairOptionTradeoffs } from './tradeoff.normalizer';

function issue(partial: Partial<FeasibilityIssueDto> & Pick<FeasibilityIssueDto, 'id' | 'message'>): FeasibilityIssueDto {
  return {
    priority: 'must_handle',
    category: 'transport',
    title: partial.message.slice(0, 40),
    affectedDays: [3],
    severity: 'high',
    ...partial,
    message: partial.message,
    id: partial.id,
  };
}

describe('decision-semantics normalizers', () => {
  it('maps must_handle drive issue to HARD + BLOCK + non-overridable', () => {
    const i = issue({
      id: 'issue-daily-drive-d3',
      message: 'Day 3 累计驾驶超过上限',
      issueKind: 'daily_drive',
      anchors: { shortfallMinutes: 90, travelMinutes: 492 },
    });
    const assertion = buildAssertionFromFeasibilityIssue(i, 'trip1');
    expect(assertion.nature).toBe('HARD_CONSTRAINT');
    expect(assertion.enforcement).toBe('BLOCK');
    expect(assertion.overridable).toBe(false);
  });

  it('maps team_fit to PREFERENCE_CONFLICT + affected members', () => {
    const i = issue({
      id: 'issue-team-1',
      category: 'team_fit',
      priority: 'suggest_adjust',
      severity: 'medium',
      message: '团队节奏与画像冲突',
      uiHints: { affectedMemberIds: ['member-a', 'member-b'] },
    });
    const { problem, assertion } = adaptFeasibilityIssueToProblem(i, 'trip1', 'v3', '2026-06-30T00:00:00Z');
    expect(problem.type).toBe('PREFERENCE_CONFLICT');
    expect(assertion.nature).toBe('SOFT_CONSTRAINT');
    expect(problem.affectedScope.some((s) => s.scopeType === 'MEMBER' && s.scopeId === 'member-a')).toBe(true);
    expect(problem.authority?.requiredApprover).toBe('AFFECTED_MEMBERS');
  });

  it('derives member impacts from leg delay', () => {
    const i = issue({
      id: 'issue-leg-delay',
      fromItemId: 'item-a',
      toItemId: 'item-b',
      anchors: { shortfallMinutes: 120, arriveAt: '22:30' },
      message: '路段延迟影响入住',
    });
    const { problem } = adaptFeasibilityIssueToProblem(i, 'trip1', 'v1', '2026-06-30T00:00:00Z');
    const tripScope = problem.affectedScope.find((s) => s.scopeType === 'TRIP');
    expect(tripScope?.memberImpacts?.length).toBeGreaterThan(0);
    expect(tripScope?.memberImpacts?.some((m) => m.derivedFrom?.length)).toBe(true);
  });

  it('parses tradeoff dimensions from impact summary', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'insert_rest',
        title: '插入缓冲日',
        description: '拆分长途驾驶',
        impact: 'high',
      },
      issue({
        id: 'x',
        message: '驾驶过长',
        anchors: { shortfallMinutes: 45 },
      }),
    );
    expect(tradeoffs.some((t) => t.dimension === 'FATIGUE' && t.value == null)).toBe(true);
  });

  it('maps risk / coverage gap to INFORMATION_GAP', () => {
    const i = issue({
      id: 'issue-gap',
      priority: 'suggest_adjust',
      severity: 'medium',
      message: '道路状态证据未获取',
      proofs: [
        {
          entity: '路段',
          constraint: 'road_status',
          currentFact: '未获取',
          evidenceSource: 'readiness',
          evidenceType: 'coverage-gap',
          conclusion: '待补充',
        },
      ],
    });
    expect(inferNatureFromIssue(i)).toBe('INFORMATION_GAP');
    expect(inferEnforcement(inferNatureFromIssue(i), i.priority, i)).toBe('INFORM');
    expect(isOverridable(inferNatureFromIssue(i), 'WARN', i.issueKind)).toBe(true);
  });
});
