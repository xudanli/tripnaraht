import {
  aggregateFailurePatterns,
  aggregatePolicyMetrics,
  compareDecisionObservability,
  deriveFailurePattern,
  suggestedActionsForPattern,
} from './agent-policy-optimization.util';
import { TRIP_RUN_OBSERVABILITY_SCHEMA_ID } from './trip-run-observability.util';

function obs(partial: Record<string, any>) {
  return {
    schemaId: TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
    version: 1 as const,
    projectedAt: new Date().toISOString(),
    decisionCompleteness: 'PARTIAL' as const,
    decisionTrace: null,
    evidenceTrace: null,
    steps: [],
    failure: null,
    memoryTrace: null,
    toolEvaluation: null,
    feedback: null,
    behavior: null,
    outcome: null,
    qualityMetrics: null,
    benchmark: null,
    ...partial,
  };
}

describe('agent-policy-optimization.util', () => {
  it('derives SAFETY_MISJUDGMENT from delete_day + safety constraint', () => {
    const pattern = deriveFailurePattern(
      obs({
        outcome: {
          latestEvent: 'delete_day',
          trustSignal: 'SEVERE_FAILURE',
          verified: true,
          eventCount: 1,
        },
        decisionTrace: {
          goalExtraction: {
            userGoal: '川藏',
            taskType: 'LIVE_EXECUTION',
            constraintsDetected: ['高风险路段'],
            confidence: null,
          },
          reasoningState: { currentState: null, missingInformation: [], deliveryStatus: null },
          optionsGenerated: [],
          finalDecision: { selected: 'route_a', reason: null, modeFinal: null },
          cockpitRows: [],
        },
        failure: {
          category: 'DECISION_ERROR',
          stage: null,
          type: null,
          severity: 'HIGH',
          recoverable: null,
          domain: null,
          code: null,
          sourceLayer: null,
          messagePreview: null,
        },
      }),
    );
    expect(pattern).toBe('SAFETY_MISJUDGMENT');
    expect(suggestedActionsForPattern(pattern!)).toContain('policy');
  });

  it('aggregates failure patterns', () => {
    const runs = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        currentAgent: 'Planner',
        status: 'COMPLETED',
        metadata: {
          observability_v1: obs({
            outcome: {
              latestEvent: 'abandon',
              trustSignal: 'TRUST_DECLINE',
              verified: true,
              eventCount: 1,
            },
          }),
        },
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        currentAgent: 'Planner',
        status: 'FAILED',
        metadata: {
          observability_v1: obs({
            failure: {
              category: 'TOOL_ERROR',
              stage: null,
              type: 'MCP_TIMEOUT',
              severity: 'HIGH',
              recoverable: true,
              domain: 'TOOL',
              code: 'MCP_TIMEOUT',
              sourceLayer: 'MCP',
              messagePreview: 'timeout',
            },
            outcome: {
              latestEvent: 'reject',
              trustSignal: 'LOW_SATISFACTION',
              verified: true,
              eventCount: 1,
            },
          }),
        },
      },
    ];
    const agg = aggregateFailurePatterns(runs);
    expect(agg.totalRunsScanned).toBe(2);
    expect(agg.patterns.length).toBeGreaterThan(0);
  });

  it('aggregates policy metrics for agents/tools/memory', () => {
    const metrics = aggregatePolicyMetrics([
      {
        id: 'a',
        currentAgent: 'Planner',
        status: 'COMPLETED',
        metadata: {
          memory_summary: { layers: ['L1'] },
          observability_v1: obs({
            feedback: { rating: 5, accepted: true, modified: false, userCorrection: null },
            toolEvaluation: [
              {
                tool: 'live_tool.mcp.hotel',
                called: true,
                ok: true,
                changedDecision: true,
                contributionScore: 0.8,
                latencyMs: 40,
              },
            ],
            qualityMetrics: {
              taskSuccess: true,
              constraintCoverage: null,
              hallucinationRisk: null,
              evidenceCoverage: 0.8,
              recoverySuccess: null,
              userSatisfaction: 1,
              toolEfficiency: 1,
            },
            memoryTrace: {
              used: [
                {
                  memoryId: 'm1',
                  content: 'x',
                  influence: 'RISK_PREFERENCE',
                  weight: 0.3,
                  confidence: 0.8,
                },
              ],
            },
          }),
        },
      },
    ]);
    expect(metrics.agents[0].agent).toBe('Planner');
    expect(metrics.agents[0].successRate).toBe(1);
    expect(metrics.tools[0].toolId).toBe('live_tool.mcp.hotel');
    expect(metrics.tools[0].changedDecisionRate).toBe(1);
    expect(metrics.memory.some((m) => m.layer === 'L1')).toBe(true);
  });

  it('compares two decisions with safety/preference deltas', () => {
    const before = obs({
      decisionTrace: {
        goalExtraction: {
          userGoal: 'x',
          taskType: null,
          constraintsDetected: ['不夜驾'],
          confidence: null,
        },
        reasoningState: { currentState: null, missingInformation: [], deliveryStatus: null },
        optionsGenerated: [],
        finalDecision: { selected: 'route_a', reason: null, modeFinal: null },
        cockpitRows: [],
      },
      feedback: { rating: null, accepted: false, modified: true, userCorrection: null },
      qualityMetrics: {
        taskSuccess: true,
        constraintCoverage: null,
        hallucinationRisk: null,
        evidenceCoverage: 0.5,
        recoverySuccess: null,
        userSatisfaction: null,
        toolEfficiency: 0.4,
      },
    });
    const after = obs({
      decisionTrace: {
        goalExtraction: {
          userGoal: 'x',
          taskType: null,
          constraintsDetected: ['不夜驾', '高风险路段'],
          confidence: null,
        },
        reasoningState: { currentState: null, missingInformation: [], deliveryStatus: null },
        optionsGenerated: [],
        finalDecision: { selected: 'route_b', reason: '更安全', modeFinal: null },
        cockpitRows: [],
      },
      feedback: { rating: null, accepted: true, modified: false, userCorrection: null },
      qualityMetrics: {
        taskSuccess: true,
        constraintCoverage: null,
        hallucinationRisk: null,
        evidenceCoverage: 0.9,
        recoverySuccess: null,
        userSatisfaction: null,
        toolEfficiency: 0.7,
      },
    });
    const cmp = compareDecisionObservability(before, after);
    expect(cmp.decisionSelected.changed).toBe(true);
    expect(cmp.safetyDelta.added).toContain('高风险路段');
    expect(cmp.preferenceDelta.scoreDelta).toBe(100);
    expect(cmp.evidenceDelta.delta).toBe(40);
  });
});
