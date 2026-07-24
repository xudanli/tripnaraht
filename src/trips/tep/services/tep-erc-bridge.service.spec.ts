import type { ExecutionAdjustmentQueueDto } from '../../../mobile/dto/mobile-execution.types';
import { RECOVERY_GRAPH_SCHEMA } from '../contracts/tep-self-drive.types';
import { TepErcBridgeService } from './tep-erc-bridge.service';
import { TepPlanMetadataService } from './tep-plan-metadata.service';

describe('TepErcBridgeService', () => {
  it('adds SDR-101 repair interventions from recoveryGraph', async () => {
    const planMetadata = {
      loadTepMetadata: jest.fn(async () => ({
        planVersionId: 'plan_v1',
        tep: {
          schemaId: 'tripnara/tep_plan_version_metadata@v1',
          syncedAt: '2026-08-01T00:00:00.000Z',
          decisionHooks: [],
          recoveryGraph: {
            schemaId: RECOVERY_GRAPH_SCHEMA,
            removableNodes: ['activity_stop_1'],
            movableNodes: [],
            replaceableNodes: [],
            protectedNodes: [],
            dependencies: [],
            fallbackOptions: [
              {
                optionId: 'REPAIR-SDR101-D1-activity_stop_1',
                triggerRuleId: 'SDR-101',
                action: 'REMOVE',
                targetRefs: ['activity_stop_1', 'day_1'],
                description: '删除可选停靠，释放约 40 分钟，负荷 HIGH→MEDIUM',
              },
            ],
          },
        },
      })),
    } as unknown as TepPlanMetadataService;

    const bridge = new TepErcBridgeService(planMetadata);
    const baseQueue: ExecutionAdjustmentQueueDto = {
      schemaId: 'tripnara.execution_adjustment_queue@v1',
      tripId: 'trip_1',
      contextVersion: 1,
      projectionSource: 'execution_risk_center',
      pendingCount: 0,
      criticalCount: 0,
      highPriorityCount: 0,
      headline: '暂无待调整事项',
      items: [],
      countsByType: {
        SAFETY_INTERVENTION: 0,
        DYNAMIC_REPLAN: 0,
        TEAM_COORDINATION: 0,
        EXECUTION_PREPARATION: 0,
      },
    };

    const enriched = await bridge.enrichAdjustmentQueue('trip_1', baseQueue);

    expect(enriched.items).toHaveLength(1);
    expect(enriched.items[0]?.id).toBe('intervention-tep-REPAIR-SDR101-D1-activity_stop_1');
    expect(enriched.items[0]?.type).toBe('DYNAMIC_REPLAN');
    expect(enriched.pendingCount).toBe(1);
    expect(enriched.items[0]?.actions.primary.label).toBe(
      '删除可选停靠，释放约 40 分钟，负荷 HIGH→MEDIUM',
    );
    expect(enriched.items[0]?.userActions?.[0]?.label).toBe(
      '删除可选停靠，释放约 40 分钟，负荷 HIGH→MEDIUM',
    );
    expect(enriched.items[0]?.causalChain.recommendedOption?.optionId).toBe(
      'REPAIR-SDR101-D1-activity_stop_1',
    );
  });
});
