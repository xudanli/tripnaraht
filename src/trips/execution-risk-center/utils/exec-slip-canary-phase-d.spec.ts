import { filterExecSlipCanaryRisks, isExecSlipCanaryInScopeRisk } from './exec-slip-canary-risk-scope.util';
import { mergeRecoveryIntoUserActions, resolveRecoveryOptionLabel } from './execution-recovery-user-actions.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';

describe('exec-slip-canary-risk-scope.util', () => {
  const baseRisk = (overrides: Partial<ActiveRisk>): ActiveRisk =>
    ({
      id: 'risk_1',
      riskKey: 'k1',
      tripId: 'c0c77777-7777-4777-8777-777777777777',
      type: 'ENVIRONMENT',
      code: 'WEATHER_SEVERE',
      title: 'Volcanic ash warning',
      summary: 'Airspace closure due to volcanic ash cloud',
      level: 'HIGH',
      lifecycleStatus: 'ACTIVE',
      acknowledgementStatus: 'UNSEEN',
      treatmentStatus: 'ACTION_REQUIRED',
      detectedAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
      affectedMembers: [],
      affectedActivities: [],
      affectedLocations: [],
      affectedRouteSegments: [],
      sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-1' }],
      evidenceRefs: [],
      recommendationIds: [],
      interventionIds: [],
      decisionProblemIds: [],
      knowledgeCode: 'ENV-FIRE-02',
      generationMode: 'CAUSAL_DERIVATION',
      ...overrides,
    }) as ActiveRisk;

  it('filters volcanic knowledge derivations on exec slip canary', () => {
    expect(isExecSlipCanaryInScopeRisk(baseRisk({}))).toBe(false);
    const kept = filterExecSlipCanaryRisks(
      [
        baseRisk({}),
        baseRisk({
          id: 'risk_time',
          title: '时间冲突',
          decisionProblemIds: ['dp_id:issue-time-conflict'],
          sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp_id:issue-time-conflict' }],
          knowledgeCode: undefined,
        }),
      ],
      'c0c77777-7777-4777-8777-777777777777',
    );
    expect(kept.map((r) => r.id)).toEqual(['risk_time']);
  });
});

describe('execution-recovery-user-actions.util', () => {
  it('uses recovery option description as primary action label', () => {
    const item = {
      recommendation: {
        title: '改走 Exec Slip Canary POI C（Substitute），预计仍可在 16:00 前入场',
        summary: '改走 Exec Slip Canary POI C（Substitute），预计仍可在 16:00 前入场',
        recommendedActionId: 'REPAIR-EXEC-SLIP-SUBSTITUTE-C',
        keeps: [],
        costs: [],
      },
      causalChain: {
        headline: '',
        assessment: '',
        nodes: [],
        recommendedOption: {
          optionId: 'REPAIR-EXEC-SLIP-SUBSTITUTE-C',
          summary: '改走 Exec Slip Canary POI C（Substitute），预计仍可在 16:00 前入场',
        },
      },
      alternativeActions: [],
      recommendedAction: '应用备选方案恢复可执行性',
      actions: {
        primary: { label: '查看方案', action: 'accept', enabled: true },
        secondary: { label: '保留原计划', action: 'keep_original', enabled: false },
      },
    } as ExecutionInterventionDto;

    expect(resolveRecoveryOptionLabel(item)).toContain('POI C');
    const actions = mergeRecoveryIntoUserActions(item);
    expect(actions[0]?.label).toContain('POI C');
    expect(actions[0]?.role).toBe('primary');
  });
});
