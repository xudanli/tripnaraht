import { Module } from '@nestjs/common';
import { HarnessIdempotencyRegistryService } from './runtime/harness-idempotency-registry.service';
import { HarnessStateProjectionService } from './runtime/state-projection.service';
import { HarnessStepContractRegistryService } from './runtime/harness-step-contract.registry';
import { HarnessDeterministicValidatorsFacade } from './runtime/harness-deterministic-validators.facade';
import { HarnessFailureRouterService } from './runtime/harness-failure-router.service';
import { HarnessStepRunnerService } from './runtime/harness-step-runner.service';
import { HarnessTraceRecorderService } from './tracing/harness-trace-recorder.service';
import { HarnessIdempotencyKeyValidator } from './validators/deterministic/idempotency-key.validator';
import { HarnessEvidenceVersionBindingValidator } from './validators/deterministic/evidence-version-binding.validator';
import { HarnessGateBeforePlanValidator } from './validators/deterministic/gate-before-plan.validator';
import { HarnessResearchSnapshotPresentValidator } from './validators/deterministic/research-snapshot-present.validator';
import { HarnessItineraryDateContinuityValidator } from './validators/deterministic/itinerary-date-continuity.validator';
import { HarnessBudgetOverrunValidator } from './validators/deterministic/budget-overrun.validator';
import { HarnessUserIntentBudgetValidator } from './validators/deterministic/user-intent-budget.validator';
import { HarnessSystemRequestIdValidator } from './validators/deterministic/system-request-id.validator';
import { HarnessReplayBuilderService } from './tracing/harness-replay-builder.service';
import { HarnessTraceFilesystemExportService } from './tracing/harness-trace-filesystem-export.service';
import { HarnessTrajectoryExporterService } from './exporters/harness-trajectory-exporter.service';
import { HarnessInferentialGradersFacade } from './inferential/harness-inferential-graders.facade';
import { HarnessStubPassInferentialGrader } from './inferential/stub-pass.inferential-grader';
import { HarnessPacingHeuristicInferentialGrader } from './inferential/pacing-heuristic.inferential-grader';

@Module({
  providers: [
    HarnessIdempotencyRegistryService,
    HarnessStateProjectionService,
    HarnessStepContractRegistryService,
    HarnessDeterministicValidatorsFacade,
    HarnessFailureRouterService,
    HarnessTraceRecorderService,
    HarnessIdempotencyKeyValidator,
    HarnessEvidenceVersionBindingValidator,
    HarnessGateBeforePlanValidator,
    HarnessResearchSnapshotPresentValidator,
    HarnessItineraryDateContinuityValidator,
    HarnessBudgetOverrunValidator,
    HarnessUserIntentBudgetValidator,
    HarnessSystemRequestIdValidator,
    HarnessReplayBuilderService,
    HarnessTraceFilesystemExportService,
    HarnessTrajectoryExporterService,
    HarnessStubPassInferentialGrader,
    HarnessPacingHeuristicInferentialGrader,
    HarnessInferentialGradersFacade,
    HarnessStepRunnerService,
  ],
  exports: [
    HarnessStepRunnerService,
    HarnessStepContractRegistryService,
    HarnessTraceRecorderService,
    HarnessReplayBuilderService,
    HarnessTraceFilesystemExportService,
    HarnessTrajectoryExporterService,
    HarnessInferentialGradersFacade,
    HarnessIdempotencyRegistryService,
    HarnessStateProjectionService,
  ],
})
export class HarnessModule {}
