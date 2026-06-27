import {
  buildDeepLinkForFeasibilityIssue,
  buildPresentationSnapshotForFeasibilityIssue,
  projectFeasibilityIssueToPersonaAlert,
} from './guardian-user-facing.projection.util';
import type { FeasibilityIssueDto } from '../trip-constraint-solver/types/trip-constraint-solver.types';
import { PersonaType } from '../dto/persona-alerts.dto';

describe('guardian-user-facing.projection.util', () => {
  const issue: FeasibilityIssueDto = {
    id: 'issue-wind-day3',
    priority: 'must_handle',
    category: 'environment',
    title: '第 3 天大风不宜自驾',
    message: '第 3 天大风条件下不建议自驾穿越高地；请打开可执行证明查看调整项。',
    affectedDays: [3],
    severity: 'high',
    issueKind: 'environment_wind',
  };

  it('projects feasibility issue with presentation snapshot and deepLink', () => {
    const alert = projectFeasibilityIssueToPersonaAlert(issue, { audience: 'user' });
    expect(alert).toBeDefined();
    expect(alert!.persona).toBe(PersonaType.ABU);
    expect(alert!.presentation?.headline).toBe(issue.title);
    expect(alert!.presentation?.leadSpeaker).toBe('ABU');
    expect(alert!.metadata.deepLink).toEqual({
      type: 'feasibility',
      issueId: issue.id,
      dayIndex: 3,
    });
  });

  it('buildDeepLink defaults to feasibility with issueId', () => {
    const link = buildDeepLinkForFeasibilityIssue({
      ...issue,
      category: 'booking',
      affectedDays: [],
    });
    expect(link.type).toBe('plan_gate');
    expect(link.issueId).toBe(issue.id);
  });

  it('uses readiness negotiation presentation when blocker matches', () => {
    const presentation = buildPresentationSnapshotForFeasibilityIssue(issue, {
      latest: {
        phase: 'pre_repair',
        tripId: 'trip-1',
        blockerId: issue.id,
        decision: 'REJECT',
        consensusLevel: 0.2,
        humanDecisionPoints: ['确认是否接受巴士接驳'],
        conditions: [],
        keyTradeoffs: [],
        summary: '三人格协商拒绝自动修复',
        debateRoundCount: 1,
        suggestedAdjustments: [],
        personaEvaluations: [
          {
            persona: 'ABU',
            personaLabel: '守护者',
            stance: 'STRONG_OPPOSE',
            utility: 0.1,
            primaryConcerns: ['高地 F 路大风风险过高'],
          },
        ],
        negotiatedAt: new Date().toISOString(),
      },
    });
    expect(presentation.leadSpeaker).toBe('ABU');
    expect(presentation.hardConstraintBlocked).toBe(true);
    expect(presentation.narrative).toContain('高地');
  });
});
