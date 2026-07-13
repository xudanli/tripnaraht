import type { PrismaClient } from '@prisma/client';
import type { SelfDriveProfile } from '../src/trips/tep/contracts/tep-self-drive.types';
import { EffectivePlanWriteGuardService } from '../src/decision-runtime/execution/effective-plan-write-guard.service';
import { DecisionProblemDetectorService } from '../src/trips/guardian-decision-core/detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../src/trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { Rfc001PlanVersionStoreService } from '../src/trips/guardian-decision-core/plan-version/plan-version.store';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TepPlanMetadataService } from '../src/trips/tep/services/tep-plan-metadata.service';
import { TepRuntimePipelineBridgeService } from '../src/trips/tep/services/tep-runtime-pipeline.bridge';
import { TepRuntimeTriggerService } from '../src/trips/tep/services/tep-runtime-trigger.service';

export interface PilotRuntimeHints {
  certScenarioId?: string;
  profile?: SelfDriveProfile;
  previousObservation?: Record<string, number | string | string[]>;
  currentObservation?: Record<string, number | string | string[]>;
  triggerEventId?: string;
  worldStateSnapshotId?: string;
  activityArrivals?: Array<{ activityRef: string; projectedArrivalAt: string }>;
  roadConditions?: Array<{
    roadRef: string;
    roadId?: string;
    status: string;
    observedAt?: string;
    validUntil?: string;
  }>;
  expected?: {
    status: string;
    ruleIds: string[];
    outcomes?: string[];
  };
  executionSlip?: {
    slipMinutes: number;
    currentActivityId: string;
    nextActivityId: string;
    plannedDepartAt: string;
    observedAt: string;
    triggerEventId?: string;
    worldStateSnapshotId?: string;
  };
}

export function readPilotRuntimeHints(metadata: Record<string, unknown>): PilotRuntimeHints | undefined {
  const hints = metadata.tepPilotRuntimeHints;
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) return undefined;
  return hints as PilotRuntimeHints;
}

export function buildPilotRuntimeStack(prisma: PrismaClient): {
  runtimeTrigger: TepRuntimeTriggerService;
  pipelineBridge: TepRuntimePipelineBridgeService;
  planVersionStore: Rfc001PlanVersionStoreService;
  problemStore: Rfc001DecisionProblemStoreService;
  planMetadata: TepPlanMetadataService;
} {
  const prismaService = prisma as unknown as PrismaService;
  const writeGuard = new EffectivePlanWriteGuardService();
  const planVersionStore = new Rfc001PlanVersionStoreService(prismaService, writeGuard);
  const planMetadata = new TepPlanMetadataService(prismaService, planVersionStore);
  const problemStore = new Rfc001DecisionProblemStoreService(prismaService);
  const problemDetector = new DecisionProblemDetectorService(prismaService, problemStore);
  const runtimeTrigger = new TepRuntimeTriggerService(planMetadata, problemDetector);
  const pipelineBridge = new TepRuntimePipelineBridgeService(
    runtimeTrigger,
    planVersionStore,
    prismaService,
  );

  return {
    runtimeTrigger,
    pipelineBridge,
    planVersionStore,
    problemStore,
    planMetadata,
  };
}
