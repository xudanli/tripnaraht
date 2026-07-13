import { ExecutionAdjustmentQueueProjectionService } from './execution-adjustment-queue-projection.service';
import { buildHarnessActiveRisks, harnessDecisionProblemBlock } from '../harness/execution-risk-p0.harness.util';
import type { ConsumerDecisionItem, ConsumerDecisionQueueView } from '../../travel-status/types/travel-status.types';

describe('ExecutionAdjustmentQueueProjectionService', () => {
  const tripId = 'trip_er_harness_001';
  const userId = 'user_er_harness';

  const access = {
    assertTripMember: jest.fn().mockResolvedValue({ id: tripId }),
  };

  const blockRisk = buildHarnessActiveRisks().find((r) => r.decisionProblemIds.length > 0)!;
  const windRisk = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;

  const consumerBlock: ConsumerDecisionItem = {
    schemaId: 'tripnara.consumer_decision_item@v1',
    problemId: blockRisk.decisionProblemIds[0]!,
    headline: blockRisk.title,
    impact: blockRisk.summary,
    explanation: blockRisk.summary,
    severity: 'BLOCK',
    actions: {
      acceptRecommended: { enabled: true, actionId: 'a1' },
      keepOriginal: { enabled: false, actionId: 'k1' },
      viewAlternatives: { enabled: true, count: 1 },
      defer: { enabled: false, actionId: 'd1' },
    },
  };

  const queue: ConsumerDecisionQueueView = {
    schemaId: 'tripnara.consumer_decision_queue@v1',
    tripId,
    openCount: 1,
    headline: '今天需要您决定 1 件事',
    items: [consumerBlock],
    generatedAt: new Date().toISOString(),
  };

  function buildService(
    risks = buildHarnessActiveRisks(),
    queueOverride: ConsumerDecisionQueueView = queue,
  ) {
    const aggregation = {
      listRisks: jest.fn().mockResolvedValue(risks),
    };
    const decisionQueue = {
      getQueue: jest.fn().mockResolvedValue(queueOverride),
    };
    const decisionReadModel = {
      listProblems: jest.fn().mockResolvedValue({
        items: [harnessDecisionProblemBlock()],
      }),
    };

    const service = new ExecutionAdjustmentQueueProjectionService(
      access as never,
      aggregation as never,
      decisionQueue as never,
      decisionReadModel as never,
    );

    return { service, aggregation, decisionQueue, decisionReadModel };
  }

  it('projects decision queue items with linkedRiskIds', async () => {
    const risksWithMembers = buildHarnessActiveRisks().map((r) =>
      r.decisionProblemIds.length > 0
        ? {
            ...r,
            affectedMembers: [
              { id: 'u1', label: 'Patrick', kind: 'member' as const },
              { id: 'u2', label: 'Abu', kind: 'member' as const },
            ],
          }
        : r,
    );
    const { service } = buildService(risksWithMembers);
    const result = await service.getAdjustmentQueue(tripId, userId, {
      memberNamesById: new Map([['u1', 'Patrick']]),
      activityTitleById: new Map([['item-drive-1', 'F208 穿越']]),
    });

    expect(result.projectionSource).toBe('execution_risk_center');
    expect(result.schemaId).toBe('tripnara.execution_adjustment_queue@v1');
    expect(result.items.some((i) => i.decisionProblemId === consumerBlock.problemId)).toBe(true);

    const linked = result.items.find((i) => i.decisionProblemId === consumerBlock.problemId);
    expect(linked?.linkedRiskIds).toContain(blockRisk.id);
    expect(linked?.primaryRiskId).toBe(blockRisk.id);
    expect(linked?.affectedActivities).toContain('F208 穿越');
    expect(linked?.affectedMembers).toEqual(['Patrick', 'Abu']);
  });

  it('projects env-rec weather risk into adjustment queue when decision queue is empty', async () => {
    const risksWithoutDp = buildHarnessActiveRisks().map((r) =>
      r.id === windRisk.id
        ? {
            ...r,
            decisionProblemIds: [],
            affectedMembers: [
              { id: 'u1', label: 'Patrick', kind: 'member' as const },
              { id: 'u2', label: 'Abu', kind: 'member' as const },
            ],
          }
        : r,
    );
    const emptyQueue: ConsumerDecisionQueueView = {
      ...queue,
      items: [],
      openCount: 0,
      headline: '暂无待调整事项',
    };
    const { service } = buildService(risksWithoutDp, emptyQueue);

    const result = await service.getAdjustmentQueue(tripId, userId, {
      memberNamesById: new Map(),
      activityTitleById: new Map(),
    });

    const riskItem =
      result.items.find((i) => i.id === `intervention-risk-${windRisk.id}`) ??
      result.items.find((i) => i.primaryRiskId === windRisk.id);
    expect(riskItem).toBeDefined();
    expect(riskItem?.linkedRiskIds).toContain(windRisk.id);
    expect(riskItem?.clusterId).toBeDefined();
    expect(riskItem?.recommendationId).toMatch(/^env-rec-/);
    expect(riskItem?.environmentEventId).toBeDefined();
    expect(riskItem?.decisionProblemId).toBeUndefined();
  });

  it('suppresses alert-only weather risk without env-rec recommendation', async () => {
    const advisoryWind = {
      ...windRisk,
      decisionProblemIds: [] as string[],
      recommendationIds: [] as string[],
    };
    const emptyQueue: ConsumerDecisionQueueView = {
      ...queue,
      items: [],
      openCount: 0,
      headline: '暂无待调整事项',
    };
    const { service } = buildService([advisoryWind], emptyQueue);

    const result = await service.getAdjustmentQueue(tripId, userId, {
      memberNamesById: new Map(),
      activityTitleById: new Map(),
    });

    expect(result.items.some((i) => i.primaryRiskId === advisoryWind.id)).toBe(false);
  });

  it('dedupes covered risks and sorts by priority', async () => {
    const { service } = buildService();
    const result = await service.getAdjustmentQueue(tripId, userId, {
      memberNamesById: new Map(),
      activityTitleById: new Map(),
    });

    const riskDupes = result.items.filter((i) => i.linkedRiskIds?.includes(blockRisk.id));
    expect(riskDupes).toHaveLength(1);
    expect(result.items[0]?.priority).toBe('CRITICAL');
    expect(result.linkedActiveRiskCount).toBeGreaterThan(0);
    expect(result.generatedAt).toBeDefined();
  });

  it('aligns headline pendingCount with projected items length', async () => {
    const extraClusterQueue: ConsumerDecisionQueueView = {
      ...queue,
      openCount: 1,
      headline: '今天需要您决定 1 件事',
      items: [consumerBlock],
    };
    const { service } = buildService(buildHarnessActiveRisks(), extraClusterQueue);
    const result = await service.getAdjustmentQueue(tripId, userId, {
      memberNamesById: new Map(),
      activityTitleById: new Map(),
    });

    expect(result.pendingCount).toBe(result.items.length);
    expect(result.headline).toContain(String(result.pendingCount));
    expect(result.headline).toContain('今天需要您决定');
  });
});
