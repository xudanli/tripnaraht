import { DecisionEngineGatewayService } from './services/decision-engine-gateway.service';
import { UnifiedDecisionProblemReadModelService } from './services/unified-decision-problem-read-model.service';

describe('DecisionEngineGatewayService.listProblems', () => {
  const prevGateway = process.env.DECISION_GATEWAY_UNIFIED;

  beforeEach(() => {
    process.env.DECISION_GATEWAY_UNIFIED = '1';
  });

  afterEach(() => {
    if (prevGateway === undefined) delete process.env.DECISION_GATEWAY_UNIFIED;
    else process.env.DECISION_GATEWAY_UNIFIED = prevGateway;
  });

  it('returns unified v2 list with queue display fields', async () => {
    const readModel = {
      listProblems: jest.fn(async () => ({
        schemaId: 'tripnara.unified_decision_problems@v2',
        tripId: 'trip_1',
        generatedAt: new Date().toISOString(),
        meta: {
          total: 1,
          openCount: 1,
          actionableCount: 1,
          occurrenceCount: 14,
          byEnforcement: { BLOCK: 1 },
        },
        items: [
          {
            problemId: 'problem_f208',
            semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
            instanceKey: 'ROAD_SEGMENT_UNAVAILABLE:trip:trip_1:problem:problem_f208',
            type: 'INFEASIBILITY',
            dimension: 'TRANSPORT',
            enforcement: 'BLOCK',
            phase: 'PLANNING',
            affectsPlan: true,
            workflowStatus: 'OPEN',
            executionStatus: 'NOT_STARTED',
            title: '道路不可用',
            summary: 'F208 道路关闭',
            categoryLabel: '交通',
            legacySummary: {
              affectedDayNumbers: [1],
              affectedScopeSummary: 'F208',
              categoryLabel: '交通',
              description: 'F208 道路关闭',
            },
            scope: { tripId: 'trip_1', dayIds: [1] },
            evidenceSummary: { count: 1, freshness: 'FRESH' },
            actionability: { requiresAction: true, allowedActions: ['REPAIR'] },
            occurrenceCount: 1,
          },
        ],
      })),
    };

    const gateway = new DecisionEngineGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      readModel as never,
    );

    const list = await gateway.listProblems('trip_1');
    expect(list.schemaId).toBe('tripnara.unified_decision_problems@v2');
    expect(list.items[0]).not.toHaveProperty('flow');
    expect(list.items[0]).not.toHaveProperty('canonicalSummary');
    expect(list.items[0].legacySummary).toMatchObject({
      affectedDayNumbers: [1],
      categoryLabel: '交通',
    });
    expect(list.meta.occurrenceCount).toBe(14);
    expect(list.items[0].semanticKey).toBe('ROAD_SEGMENT_UNAVAILABLE');
  });

  it('includes debug metadata when requested', async () => {
    const readModel = {
      listProblems: jest.fn(async (_tripId: string, opts?: { includeDebug?: boolean }) => ({
        schemaId: 'tripnara.unified_decision_problems@v2',
        tripId: 'trip_1',
        generatedAt: new Date().toISOString(),
        meta: { total: 0, openCount: 0, actionableCount: 0, occurrenceCount: 0, byEnforcement: {} },
        items: opts?.includeDebug
          ? [
              {
                problemId: 'p1',
                semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
                instanceKey: 'k1',
                debug: { authority: 'CANONICAL', engineId: 'CANONICAL_DECISION_RUNTIME', resolution: 'PRIMARY', sourceIds: [] },
              },
            ]
          : [],
      })),
    };

    const gateway = new DecisionEngineGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      readModel as never,
    );

    const list = await gateway.listProblems('trip_1', { includeDebug: true });
    expect(readModel.listProblems).toHaveBeenCalledWith('trip_1', {
      includeDebug: true,
      queueOnly: true,
    });
    expect(list.items[0]?.debug?.authority).toBe('CANONICAL');
  });
});

describe('UnifiedDecisionProblemReadModelService', () => {
  it('is injectable with collector + adapters', () => {
    expect(UnifiedDecisionProblemReadModelService).toBeDefined();
  });
});
