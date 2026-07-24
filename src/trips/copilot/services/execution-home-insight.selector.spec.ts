import { selectExecutionHomeInsight } from './execution-home-insight.selector';
import type { ExecutionHomeBuiltContext } from './execution-home-page-context.builder';

function baseBuilt(
  overrides: Partial<ExecutionHomeBuiltContext> = {},
): ExecutionHomeBuiltContext {
  return {
    authoritative: {
      tripSnapshot: { tripVersion: 'v1' },
      relevantWorldState: { worldStateVersion: 'none' },
      constraintAssessments: [],
      decisionProblems: [],
      selectedEntities: [],
      availableActions: [],
      pageFocus: {
        pageId: 'EXECUTION_HOME',
        lifecycle: 'TRAVELING',
        selectedRefs: [],
      },
    },
    versions: { relevantTripProjectionVersion: 'v1' },
    gate: { ok: true, missing: [] },
    severity: 'CLEAR',
    delayMinutes: 0,
    blockingDecisionCount: 0,
    highRiskCount: 0,
    missWindowRisk: false,
    allowedFactTokens: ['0', '晚点', '分钟'],
    ...overrides,
  };
}

describe('selectExecutionHomeInsight', () => {
  it('SILENT when CLEAR and not explicit ask', () => {
    const sel = selectExecutionHomeInsight({ built: baseBuilt() });
    expect(sel.mode).toBe('SILENT');
    expect(sel.modeReason).toBe('EXEC_ON_TRACK');
    expect(sel.actions).toHaveLength(0);
  });

  it('ATTENTION on CONTEXT_MISSING', () => {
    const sel = selectExecutionHomeInsight({
      built: baseBuilt({
        gate: { ok: false, code: 'CONTEXT_MISSING', missing: ['lifecycle'] },
      }),
    });
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.modeReason).toBe('CONTEXT_MISSING');
    expect(sel.hasValidatedRecommendation).toBe(false);
  });

  it('ATTENTION with delay copy when schedule at risk', () => {
    const sel = selectExecutionHomeInsight({
      built: baseBuilt({
        severity: 'ATTENTION',
        delayMinutes: 20,
        nextActivityLabel: '蓝湖',
        missWindowRisk: false,
        allowedFactTokens: ['20', '蓝湖', '晚点', '分钟'],
      }),
    });
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.modeReason).toBe('SCHEDULE_AT_RISK');
    expect(sel.observationSummary).toContain('晚点');
    expect(sel.observationSummary).toContain('蓝湖');
    expect(sel.ruleSuggestion).toContain('抓紧');
  });

  it('INTERVENTION with risk actions on STOP', () => {
    const sel = selectExecutionHomeInsight({
      built: baseBuilt({
        severity: 'INTERVENTION',
        topRisk: {
          riskId: 'risk_1',
          level: 'CRITICAL',
          executionGate: 'STOP',
          summary: '前方道路封闭，不可继续原路线。',
        },
        allowedFactTokens: ['前方道路封闭，不可继续原路线。', 'CRITICAL'],
      }),
    });
    expect(sel.mode).toBe('INTERVENTION');
    expect(sel.modeReason).toBe('SAFETY_RISK');
    expect(sel.actions.map((a) => a.actionType)).toEqual(
      expect.arrayContaining(['ACKNOWLEDGE_RISK', 'PREVIEW_PLAN_CHANGE']),
    );
  });
});
