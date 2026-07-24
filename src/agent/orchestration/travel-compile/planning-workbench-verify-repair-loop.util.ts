import type { ConfigService } from '@nestjs/config';
import type { PlanState, GateStatus } from '../../../skills/plan/shared/plan-state.types';
import type { CtreCompileProgressView } from '../../../travel-compiler/contracts/ctre-compile-progress.types';
import type { TravelCompilerService } from '../../../travel-compiler/travel-compiler.service';
import type { TravelGraphStoreService } from '../../../travel-compiler/services/travel-graph-store.service';
import {
  getWorkbenchVerifyRepairMaxIterations,
  isWorkbenchVerifyRepairEnabled,
} from '../../../travel-compiler/utils/travel-compiler-config.util';
import type { PlanningWorkbenchKernelBridgeService } from '../../services/planning-workbench-kernel-bridge.service';
import type { PlanningWorkbenchRequest } from '../../services/planning-workbench-agent.service';
import type {
  PlanningWorkbenchKernelRepairMetadata,
  PlanningWorkbenchKernelVerifyMetadata,
} from './planning-workbench-kernel-verify.util';
import { workbenchVerifyNeedsRepairFromSummary } from './planning-workbench-kernel-verify.util';
import {
  runPlanningWorkbenchTravelCompile,
  type PlanningWorkbenchCtreOutcome,
} from './planning-workbench-travel-compile.util';

export type WorkbenchVerifyRepairLoopRound = {
  round: number;
  verify: PlanningWorkbenchKernelVerifyMetadata;
  repair?: PlanningWorkbenchKernelRepairMetadata;
  recompile?: Pick<
    PlanningWorkbenchCtreOutcome,
    'skipped' | 'progress' | 'incrementalRepair' | 'segmentEnrichment' | 'graphProjectedItemCount'
  >;
};

export type WorkbenchVerifyRepairLoopTerminatedReason =
  | 'verify_skipped'
  | 'clean'
  | 'fatal'
  | 'repair_not_applied'
  | 'max_iterations'
  | 'repair_disabled';

export type WorkbenchVerifyRepairLoopOutcome = {
  skipped: boolean;
  reason?: string;
  gateStatus: GateStatus;
  terminatedReason?: WorkbenchVerifyRepairLoopTerminatedReason;
  rounds: WorkbenchVerifyRepairLoopRound[];
  repairCount: number;
  finalVerify?: PlanningWorkbenchKernelVerifyMetadata;
  finalCtre?: Pick<
    PlanningWorkbenchCtreOutcome,
    'progress' | 'graphProjectedItemCount' | 'segmentEnrichment' | 'incrementalRepair' | 'verifySsotApplied'
  >;
};

export async function runPlanningWorkbenchVerifyRepairLoop(params: {
  request: PlanningWorkbenchRequest;
  planState: PlanState;
  tripRunId?: string | null;
  priorGateStatus?: GateStatus;
  kernelBridge: PlanningWorkbenchKernelBridgeService;
  compiler?: TravelCompilerService;
  graphStore?: TravelGraphStoreService;
  configService?: ConfigService;
  enableTravelCompiler?: boolean;
  onProgress?: (progressPct: number, message: string) => void;
}): Promise<WorkbenchVerifyRepairLoopOutcome> {
  const {
    request,
    planState,
    kernelBridge,
    compiler,
    graphStore,
    configService,
    enableTravelCompiler,
    onProgress,
  } = params;
  const priorGate =
    params.priorGateStatus ??
    planState.gate ?? {
      status: 'NEED_CONFIRM' as const,
      reasons: [],
      missingEvidence: [],
    };

  if (!kernelBridge.isVerifyAvailable()) {
    return {
      skipped: true,
      reason: 'decision_kernel_unavailable',
      gateStatus: priorGate,
      rounds: [],
      repairCount: 0,
    };
  }

  const maxRepairs = getWorkbenchVerifyRepairMaxIterations(configService);
  const repairEnabled = isWorkbenchVerifyRepairEnabled(configService);
  const rounds: WorkbenchVerifyRepairLoopRound[] = [];
  let repairCount = 0;
  let gateStatus = priorGate;
  let finalCtre: WorkbenchVerifyRepairLoopOutcome['finalCtre'];
  let terminatedReason: WorkbenchVerifyRepairLoopTerminatedReason | undefined;

  onProgress?.(93, 'Decision Kernel VERIFY：校验 Graph 投影行程…');
  const first = await kernelBridge.runNativeVerifyRepairPipeline({
    request,
    planState,
    tripRunId: params.tripRunId,
    priorGateStatus: gateStatus,
    enableRepair: repairEnabled,
  });

  if (first.skipped) {
    return {
      skipped: true,
      reason: first.reason,
      gateStatus: priorGate,
      rounds: [],
      repairCount: 0,
    };
  }

  gateStatus = first.gateStatus;
  rounds.push({ round: 0, verify: first.metadata, repair: first.repair });

  if (first.metadata.fatalCount > 0) {
    return {
      skipped: false,
      gateStatus,
      terminatedReason: 'fatal',
      rounds,
      repairCount: 0,
      finalVerify: first.metadata,
    };
  }

  if (!repairEnabled) {
    return {
      skipped: false,
      gateStatus,
      terminatedReason: 'repair_disabled',
      rounds,
      repairCount: 0,
      finalVerify: first.metadata,
    };
  }

  const recompileAfterRepair = async (): Promise<void> => {
    onProgress?.(94, 'CTRE 修复后增量重编译…');
    const outcome = await runPlanningWorkbenchTravelCompile({
      planState,
      context: request.context,
      tripId: request.tripId,
      userAction: 'adjust',
      enableTravelCompiler,
      compiler,
      graphStore,
      configService,
    });
    finalCtre = {
      progress: outcome.progress,
      graphProjectedItemCount: outcome.graphProjectedItemCount,
      segmentEnrichment: outcome.segmentEnrichment,
      incrementalRepair: outcome.incrementalRepair,
      verifySsotApplied: outcome.verifySsotApplied,
    };
    rounds[rounds.length - 1]!.recompile = {
      skipped: outcome.skipped,
      progress: outcome.progress,
      incrementalRepair: outcome.incrementalRepair,
      segmentEnrichment: outcome.segmentEnrichment,
      graphProjectedItemCount: outcome.graphProjectedItemCount,
    };
  };

  if (first.repair?.applied) {
    repairCount += 1;
    await recompileAfterRepair();

    while (true) {
      onProgress?.(94, `Decision Kernel RE-VERIFY（第 ${repairCount} 轮）…`);
      const verify = await kernelBridge.runNativeVerifyPipeline({
        request,
        planState,
        tripRunId: params.tripRunId,
        priorGateStatus: gateStatus,
      });

      if (verify.skipped) {
        terminatedReason = 'verify_skipped';
        break;
      }

      gateStatus = verify.gateStatus;
      const round: WorkbenchVerifyRepairLoopRound = {
        round: repairCount,
        verify: verify.metadata,
      };
      rounds.push(round);

      if (verify.metadata.fatalCount > 0) {
        terminatedReason = 'fatal';
        break;
      }

      if (!workbenchVerifyNeedsRepairFromSummary(verify.metadata.issues)) {
        terminatedReason = 'clean';
        break;
      }

      if (repairCount >= maxRepairs) {
        terminatedReason = 'max_iterations';
        break;
      }

      onProgress?.(94, `Decision Kernel REPAIR（第 ${repairCount + 1} 轮）…`);
      const repair = await kernelBridge.runNativeRepairPipeline({
        request,
        planState,
        tripRunId: params.tripRunId,
        priorGateStatus: gateStatus,
      });
      round.repair = repair;

      if (!repair.applied) {
        terminatedReason = 'repair_not_applied';
        break;
      }

      repairCount += 1;
      await recompileAfterRepair();
    }
  } else if (first.metadata.conflictCount === 0) {
    return {
      skipped: false,
      gateStatus,
      terminatedReason: 'clean',
      rounds,
      repairCount: 0,
      finalVerify: first.metadata,
      finalCtre,
    };
  } else {
    return {
      skipped: false,
      gateStatus,
      terminatedReason: 'repair_not_applied',
      rounds,
      repairCount: 0,
      finalVerify: first.metadata,
    };
  }

  if (!terminatedReason) {
    terminatedReason = 'clean';
  }

  const finalVerify = rounds[rounds.length - 1]?.verify ?? first.metadata;

  planState.metadata = {
    ...(planState.metadata ?? {}),
    kernelVerifyRepairLoop: {
      terminatedReason,
      repairCount,
      maxRepairs,
      rounds: rounds.length,
    },
  };

  return {
    skipped: false,
    gateStatus,
    terminatedReason,
    rounds,
    repairCount,
    finalVerify,
    finalCtre,
  };
}
