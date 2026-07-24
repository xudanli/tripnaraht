import type { RoadSegmentUnavailableRunResult } from '../../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import { ORIGINAL_CANDIDATE_ID } from '../../../trips/guardian-decision-core/adapters/repair-candidate.adapter';
import { buildRoadStatusChangedEvent } from '../../../trips/guardian-decision-core/evidence/road-status-changed.event';
import { buildItemSegmentId } from '../../../trips/guardian-decision-core/detection/road-close-impact-analyzer';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from '../../../trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { HardConstraintEvaluationBlock, HardConstraintParityFixtureV1 } from './fixtures/hard-constraint-parity.fixture';
import { ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE } from './fixtures/hard-constraint-parity.fixture';
import {
  deriveDynamicModeSafetyVerdict,
  deriveLegacyModeSafetyVerdict,
  projectCanonicalSafetyVerdictFromConstraint,
  type OrchestrationModeParityMode,
  type OrchestrationModeSafetyVerdictV1,
} from './orchestration-mode-safety-parity.util';
import { validateMutationAuthority } from '../../../decision-runtime/execution/canonical-mutation-commit-guard.util';

export type OrchestrationModeParityL2Result = {
  run: RoadSegmentUnavailableRunResult;
  constraintEvaluation: HardConstraintEvaluationBlock;
  fixture: HardConstraintParityFixtureV1;
  canonicalVerdict: OrchestrationModeSafetyVerdictV1;
  modeVerdicts: Record<OrchestrationModeParityMode, OrchestrationModeSafetyVerdictV1>;
};

/** Extract live constraint evaluation block from RFC001 SM workspace (ConstraintEvaluationGateway path). */
export function extractConstraintEvaluationFromRfc001Run(
  run: RoadSegmentUnavailableRunResult,
): HardConstraintEvaluationBlock {
  const workspace = run.workspace;
  if (!workspace) {
    throw new Error('RFC001 L2 parity requires workspace from SM evaluate path');
  }

  const hardBlocks = workspace.constraintAssertions.filter(
    (a) => a.verdict === 'BLOCK' && !a.overridable,
  );
  const violationCodes = [...new Set(hardBlocks.flatMap((a) => a.reasonCodes))].sort();

  return {
    evaluationId: `eval_${workspace.workspaceId}`,
    verdict: violationCodes.length > 0 ? 'BLOCK' : 'PASS',
    hardConstraintViolations: violationCodes,
  };
}

/** SM path verdict from live RFC001 run (GATE_EVAL + workspace assertions). */
export function deriveSmModeSafetyVerdictFromRfc001Run(
  run: RoadSegmentUnavailableRunResult,
  constraintEvaluation: HardConstraintEvaluationBlock,
): OrchestrationModeSafetyVerdictV1 {
  const workspace = run.workspace!;
  const canonical = projectCanonicalSafetyVerdictFromConstraint(constraintEvaluation);

  const originalBlocked = workspace.constraintAssertions.some(
    (a) =>
      a.targetCandidateId === ORIGINAL_CANDIDATE_ID &&
      a.verdict === 'BLOCK' &&
      !a.overridable,
  );

  const validation = validateMutationAuthority({
    tripId: run.tripId,
    decisionId: run.record?.decisionId ?? '',
    expectedTripVersion: ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE.clientTripVersion,
    constraintEvaluation,
    evidenceSnapshot: {
      snapshotId: workspace.worldStateSnapshotId,
      capturedAt: workspace.createdAt,
    },
    writeAuthority: { verdict: 'DENY', reasonCodes: ['WRITE_GUARD_DENY'] },
    executionSource: {
      routeClass: 'FULL_DEEP_PLAN',
      orchestrationMode: 'CLAUDE_SM',
    },
  });

  return {
    executable: originalBlocked ? false : canonical.executable,
    needsConfirmation: run.humanDecisionRequired || canonical.needsConfirmation,
    writeAllowed: validation.allowed,
    violationCodes: [...constraintEvaluation.hardConstraintViolations].sort(),
  };
}

function buildL2Fixture(
  run: RoadSegmentUnavailableRunResult,
  constraintEvaluation: HardConstraintEvaluationBlock,
): HardConstraintParityFixtureV1 {
  return {
    ...ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE,
    tripId: run.tripId,
    constraintEvaluation,
  };
}

/** Run Iceland F208 harness once; derive three-mode safety verdicts from live constraint block. */
export async function runOrchestrationModeSafetyParityL2(): Promise<OrchestrationModeParityL2Result> {
  const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
  const prisma = mock as unknown as PrismaService;
  const stack = buildIcelandRoadCloseHarnessStack(prisma);

  const event = buildRoadStatusChangedEvent({
    tripId: HARNESS_TRIP_ID,
    roadId: 'F208',
    status: 'CLOSED',
    segmentId: buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE),
    sourceProvider: 'road.is_api',
  });

  const run = await stack.runner.runFullFromEvent(event);
  if (!run.workspace || !run.record) {
    throw new Error('Iceland F208 L2 harness did not produce workspace + decision record');
  }

  const constraintEvaluation = extractConstraintEvaluationFromRfc001Run(run);
  const fixture = buildL2Fixture(run, constraintEvaluation);
  const canonicalVerdict = projectCanonicalSafetyVerdictFromConstraint(constraintEvaluation);

  const modeVerdicts: Record<OrchestrationModeParityMode, OrchestrationModeSafetyVerdictV1> = {
    CLAUDE_SM: deriveSmModeSafetyVerdictFromRfc001Run(run, constraintEvaluation),
    CLAUDE_DYNAMIC: deriveDynamicModeSafetyVerdict(fixture),
    LEGACY: deriveLegacyModeSafetyVerdict(fixture),
  };

  return {
    run,
    constraintEvaluation,
    fixture,
    canonicalVerdict,
    modeVerdicts,
  };
}
