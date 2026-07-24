import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';
import { RouteType, UIStatus } from '../../../agent/interfaces/router.interface';
import { applyLegacyMutationCommitGuard } from '../../../decision-runtime/execution/legacy-mutation-commit.adapter';
import { validateMutationAuthority } from '../../../decision-runtime/execution/canonical-mutation-commit-guard.util';
import type { HardConstraintParityFixtureV1 } from './fixtures/hard-constraint-parity.fixture';

export type OrchestrationModeSafetyVerdictV1 = {
  executable: boolean;
  needsConfirmation: boolean;
  writeAllowed: boolean;
  violationCodes: string[];
};

export type OrchestrationModeParityMode = 'CLAUDE_SM' | 'CLAUDE_DYNAMIC' | 'LEGACY';

/**
 * Canonical safety projection from constraint evaluation — SSOT for AU-P1-007 parity.
 * All orchestration modes must align on these four dimensions when given the same constraint block.
 */
export function projectCanonicalSafetyVerdictFromConstraint(
  constraintEvaluation: HardConstraintParityFixtureV1['constraintEvaluation'],
): OrchestrationModeSafetyVerdictV1 {
  const hasHardBlock =
    constraintEvaluation.verdict === 'BLOCK' ||
    constraintEvaluation.hardConstraintViolations.length > 0;

  if (hasHardBlock) {
    return {
      executable: false,
      needsConfirmation: true,
      writeAllowed: false,
      violationCodes: [...constraintEvaluation.hardConstraintViolations].sort(),
    };
  }

  return {
    executable: true,
    needsConfirmation: constraintEvaluation.verdict !== 'PASS',
    writeAllowed: false,
    violationCodes: [],
  };
}

function buildParityMutationResponse(): RouteAndRunResponseDto {
  return {
    request_id: 'au-p1-007',
    route: {
      route: RouteType.SYSTEM2_REASONING,
      confidence: 0.5,
      reasons: [],
      required_capabilities: [],
      consent_required: false,
      budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
      ui_hint: { mode: 'fast', status: UIStatus.DONE, message: 'harness' },
    },
    result: {
      status: 'OK',
      answer_text: 'draft replan day3',
      payload: {
        timeline: [],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
      },
    },
    explain: { decision_log: [] },
    observability: {
      latency_ms: 0,
      router_ms: 0,
      system_mode: 'SYSTEM2',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
    },
  };
}

function buildParityRequest(fixture: HardConstraintParityFixtureV1): RouteAndRunRequestDto {
  return {
    request_id: 'au-p1-007',
    user_id: 'harness_user',
    trip_id: fixture.tripId,
    message: `调整第三天路线，${fixture.roadSegmentId} 已封闭`,
    options: { client_dso_version: fixture.clientTripVersion },
  } as RouteAndRunRequestDto;
}

/** SM path: constraint gateway BLOCK → canonical projection + commit guard denies write. */
export function deriveSmModeSafetyVerdict(
  fixture: HardConstraintParityFixtureV1,
): OrchestrationModeSafetyVerdictV1 {
  const canonical = projectCanonicalSafetyVerdictFromConstraint(fixture.constraintEvaluation);
  const validation = validateMutationAuthority({
    tripId: fixture.tripId,
    decisionId: 'decision_sm_harness',
    expectedTripVersion: fixture.clientTripVersion,
    constraintEvaluation: fixture.constraintEvaluation,
    evidenceSnapshot: {
      snapshotId: 'evidence_sm_harness',
      capturedAt: new Date('2026-06-30T10:00:00Z').toISOString(),
    },
    writeAuthority: { verdict: 'DENY', reasonCodes: ['WRITE_GUARD_DENY'] },
    executionSource: {
      routeClass: 'FULL_DEEP_PLAN',
      orchestrationMode: 'CLAUDE_SM',
    },
  });

  return {
    ...canonical,
    writeAllowed: validation.allowed,
  };
}

/** DYNAMIC path: same constraint block → commit guard denies write (parity at authority layer). */
export function deriveDynamicModeSafetyVerdict(
  fixture: HardConstraintParityFixtureV1,
): OrchestrationModeSafetyVerdictV1 {
  const canonical = projectCanonicalSafetyVerdictFromConstraint(fixture.constraintEvaluation);
  const validation = validateMutationAuthority({
    tripId: fixture.tripId,
    decisionId: '',
    expectedTripVersion: fixture.clientTripVersion,
    constraintEvaluation: fixture.constraintEvaluation,
    evidenceSnapshot: {
      snapshotId: 'evidence_dynamic_harness',
      capturedAt: new Date('2026-06-30T10:00:00Z').toISOString(),
    },
    writeAuthority: { verdict: 'DENY', reasonCodes: ['CANONICAL_AUTHORITY_UNAVAILABLE'] },
    executionSource: {
      routeClass: 'PARTIAL_REPLAN',
      orchestrationMode: 'CLAUDE_DYNAMIC',
    },
  });

  return {
    ...canonical,
    writeAllowed: validation.allowed,
  };
}

/** LEGACY path: real legacy mutation guard with injected constraint evaluation. */
export function deriveLegacyModeSafetyVerdict(
  fixture: HardConstraintParityFixtureV1,
): OrchestrationModeSafetyVerdictV1 {
  const request = buildParityRequest(fixture);
  const response = buildParityMutationResponse();
  const guarded = applyLegacyMutationCommitGuard(request, response, {
    constraintEvaluation: fixture.constraintEvaluation,
  });
  const guardPayload = (guarded.result?.payload as Record<string, unknown> | undefined)
    ?.canonical_mutation_guard as { canCommit?: boolean } | undefined;

  const canonical = projectCanonicalSafetyVerdictFromConstraint(fixture.constraintEvaluation);
  return {
    ...canonical,
    writeAllowed: guardPayload?.canCommit === true,
  };
}

export function deriveAllModeSafetyVerdicts(fixture: HardConstraintParityFixtureV1): Record<
  OrchestrationModeParityMode,
  OrchestrationModeSafetyVerdictV1
> {
  return {
    CLAUDE_SM: deriveSmModeSafetyVerdict(fixture),
    CLAUDE_DYNAMIC: deriveDynamicModeSafetyVerdict(fixture),
    LEGACY: deriveLegacyModeSafetyVerdict(fixture),
  };
}

export function safetyVerdictsMatch(
  a: OrchestrationModeSafetyVerdictV1,
  b: OrchestrationModeSafetyVerdictV1,
): boolean {
  return (
    a.executable === b.executable &&
    a.needsConfirmation === b.needsConfirmation &&
    a.writeAllowed === b.writeAllowed &&
    a.violationCodes.join(',') === b.violationCodes.join(',')
  );
}
