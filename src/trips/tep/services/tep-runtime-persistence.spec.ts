import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { PlanVersion } from '../../guardian-decision-core/contracts/plan-version.types';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { Rfc001DecisionProblemStoreService } from '../../guardian-decision-core/persistence/rfc001-decision-problem.store';
import { DecisionProblemDetectorService } from '../../guardian-decision-core/detection/decision-problem-detector.service';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { readTepPlanVersionMetadata } from '../contracts/tep-plan-metadata.types';
import { TepPlanMetadataService } from './tep-plan-metadata.service';
import { TepRuntimeTriggerService } from './tep-runtime-trigger.service';

function createMockPrisma(tripRows: Record<string, { metadata?: unknown; updatedAt?: Date }>) {
  const stores = new Map(Object.entries(tripRows));
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        return {
          id: args.where.id,
          metadata: row.metadata ?? {},
          updatedAt: row.updatedAt ?? new Date(),
        };
      }),
      update: jest.fn(),
    },
  } as unknown as import('../../../prisma/prisma.service').PrismaService;
}

const roadHook: DecisionHook = {
  hookId: 'HOOK-ROAD-D3-1',
  targetRef: 'drive_leg_3_1',
  triggerType: 'ROAD_STATUS_CHANGE',
  sourceMetric: 'road.status',
  triggerCondition: {
    metric: 'road.status',
    operator: 'IN',
    value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
  },
  leadTime: 'PT24H',
  impactScope: ['drive_leg_3_1', 'activity_glacier_hike', 'segment:cert_301:F208'],
  defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
};

describe('TepPlanMetadataService', () => {
  it('syncs decisionHooks to PlanVersion.metadata.tep', async () => {
    const tripId = 'trip_meta_1';
    const prisma = createMockPrisma({ [tripId]: { metadata: {}, updatedAt: new Date() } });

    const versions: PlanVersion[] = [];
    const planVersionStore = {
      getEffectivePlanVersionId: jest.fn(async () => undefined),
      get: jest.fn(async (_tripId: string, id: string) => versions.find((v) => v.planVersionId === id)),
      upsert: jest.fn(async (_tripId: string, version: PlanVersion) => {
        const idx = versions.findIndex((v) => v.planVersionId === version.planVersionId);
        if (idx >= 0) versions[idx] = version;
        else versions.push(version);
        return version;
      }),
      setEffective: jest.fn(async () => ({ items: versions, effectivePlanVersionId: versions[0]?.planVersionId })),
    } as unknown as Rfc001PlanVersionStoreService;

    const service = new TepPlanMetadataService(prisma, planVersionStore);
    const result = await service.syncTepArtifacts({
      tripId,
      planVersionRef: 'plan_cert_301_v1',
      decisionHooks: [roadHook],
    });

    expect(result.synced).toBe(true);
    expect(result.tep.decisionHooks).toHaveLength(1);
    expect(versions[0]?.metadata?.tep).toBeDefined();
    const tep = readTepPlanVersionMetadata(versions[0]?.metadata as Record<string, unknown>);
    expect(tep?.decisionHooks[0]?.hookId).toBe('HOOK-ROAD-D3-1');
  });
});

describe('TepRuntimeTriggerService', () => {
  it('persists DecisionProblem when road status transitions OPEN→CLOSED (IS-CERT-301)', async () => {
    const tripId = 'trip_runtime_301';
    const problems: Rfc001DecisionProblem[] = [];

    const problemStore = {
      findOpenByTriggerEvent: jest.fn(async () => undefined),
      upsert: jest.fn(async (_tripId: string, problem: Rfc001DecisionProblem) => {
        problems.push(problem);
        return problem;
      }),
    } as unknown as Rfc001DecisionProblemStoreService;

    const problemDetector = {
      persistTepHookProblem: jest.fn(async (input: { tripId: string; problem: Rfc001DecisionProblem }) => {
        return problemStore.upsert(input.tripId, input.problem);
      }),
    } as unknown as DecisionProblemDetectorService;

    const planMetadata = {
      loadDecisionHooks: jest.fn(async () => [roadHook]),
    } as unknown as TepPlanMetadataService;

    const service = new TepRuntimeTriggerService(planMetadata, problemDetector);
    const result = await service.processObservation({
      tripId,
      planVersionId: 'plan_cert_301_v1',
      triggerEventId: 'evt_road_cert_301',
      worldStateSnapshotId: 'ws_cert_301',
      previousObservation: { 'road.status': 'OPEN' },
      currentObservation: { 'road.status': 'CLOSED' },
      decisionHooks: [roadHook],
    });

    expect(result.matched).toBe(true);
    expect(result.transitioned).toBe(true);
    expect(result.problem?.type).toBe('RESOURCE_UNAVAILABLE');
    expect(result.problem?.semanticCapability).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(problems).toHaveLength(1);
    expect(problemDetector.persistTepHookProblem).toHaveBeenCalled();
  });
});
