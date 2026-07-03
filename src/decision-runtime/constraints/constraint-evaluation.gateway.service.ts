/**
 * Constraint Evaluation Gateway — unified constraint entry (P0).
 * @see ADR-006-Unified-Decision-Runtime.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  CanonicalConstraintReport,
  ConstraintAssertion,
} from './contracts';
import type {
  EvaluateCandidateInput,
  EvaluateIssueInput,
  EvaluatePlanInput,
} from './contracts/evaluate-input.types';
import {
  dedupeAndMergeAssertions,
  deriveOverallStatus,
} from './assertion-normalizer.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import { UserConstraintProvider } from './providers/user-constraint.provider';
import { isConstraintGatewayPlanVerifyProjectionEnabled } from './constraint-plan-verify.config';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { evaluateWorldStateCompleteness } from './world-state/completeness-evaluator.util';
import { buildCompletenessAssertions } from './world-state/reality-completeness.provider';
import { recordConstraintGatewayIngressFromReport } from './constraint-gateway-ingress-audit.util';

@Injectable()
export class ConstraintEvaluationGatewayService {
  private readonly logger = new Logger(ConstraintEvaluationGatewayService.name);

  constructor(
    private readonly legacyAdapter: LegacyConstraintCheckerAdapter,
    private readonly guardianProvider: GuardianConstraintProvider,
    private readonly packProvider: DestinationPackConstraintProvider,
    private readonly failurePolicy: ConstraintFailurePolicyService,
    @Optional() private readonly userConstraintProvider?: UserConstraintProvider,
  ) {}

  async evaluatePlan(input: EvaluatePlanInput): Promise<CanonicalConstraintReport> {
    return this.evaluateInternal(input);
  }

  async evaluateCandidate(input: EvaluateCandidateInput): Promise<CanonicalConstraintReport> {
    return this.evaluateInternal(input);
  }

  async evaluateIssue(input: EvaluateIssueInput): Promise<CanonicalConstraintReport> {
    const completeness = evaluateWorldStateCompleteness({
      worldState: input.worldState,
      dataAvailability: input.dataAvailability,
    });

    const assertions: ConstraintAssertion[] = [
      ...buildCompletenessAssertions({
        tripId: input.tripId,
        completeness,
      }),
      ...this.guardianProvider.evaluate({
        tripId: input.tripId,
        guardianAssertions: input.guardianAssertions,
      }),
    ];

    const report = this.buildReport({
      tripId: input.tripId,
      assertions: dedupeAndMergeAssertions(assertions),
      completeness,
      degraded: false,
      degradedReasons: [],
    });
    recordConstraintGatewayIngressFromReport(report);
    return report;
  }

  /**
   * @deprecated Boolean compat — prefer CanonicalConstraintReport.overallStatus
   */
  async isFeasibleLegacyCompat(input: EvaluatePlanInput): Promise<boolean> {
    const report = await this.evaluatePlan(input);
    return report.overallStatus === 'FEASIBLE' || report.overallStatus === 'CONDITIONALLY_FEASIBLE';
  }

  private async evaluateInternal(
    input: EvaluatePlanInput,
  ): Promise<CanonicalConstraintReport> {
    const evaluatedAt = new Date().toISOString();
    const userEvaluation = this.userConstraintProvider
      ? await this.userConstraintProvider.evaluate({
          tripId: input.tripId,
          userId: input.userId,
          plan: input.plan,
          candidateId: input.candidateId,
        })
      : undefined;
    const userFacts = userEvaluation?.facts;
    const userAssertions = userEvaluation?.assertions ?? [];

    const completeness = evaluateWorldStateCompleteness({
      worldState: input.worldState,
      plan: input.plan,
      dataAvailability: input.dataAvailability,
    });

    const degradedReasons: string[] = [];
    let degraded = false;
    const assertionBatches: ConstraintAssertion[][] = [];

    assertionBatches.push(
      buildCompletenessAssertions({
        tripId: input.tripId,
        candidateId: input.candidateId,
        completeness,
        plan: input.plan,
        worldState: input.worldState,
      }),
    );

    assertionBatches.push(userAssertions);

    const skipLegacy =
      input.skipLegacyChecker === true ||
      (input.evaluationMode === 'PLAN_VERIFY' && isConstraintGatewayPlanVerifyProjectionEnabled());

    if (!skipLegacy) {
      assertionBatches.push(
        await this.runProvider('legacy-checker', () =>
          this.legacyAdapter.evaluate({
            tripId: input.tripId,
            plan: input.plan,
            worldState: input.worldState,
            candidateId: input.candidateId,
          }),
        ),
      );
    }

    assertionBatches.push(
      this.guardianProvider.evaluate({
        tripId: input.tripId,
        guardianAssertions: input.guardianAssertions,
      }),
    );

    assertionBatches.push(
      this.packProvider.evaluate({
        tripId: input.tripId,
        packContext: input.packContext,
      }),
    );

    for (const batch of assertionBatches) {
      for (const failure of batch.filter((a) => a.reasonCode === 'PROVIDER_EVALUATION_FAILED')) {
        if (failure.evaluator.engine.includes('legacy')) {
          degraded = true;
          degradedReasons.push(failure.message);
        }
      }
    }

    const assertions = dedupeAndMergeAssertions(assertionBatches.flat());

    const report = this.buildReport({
      tripId: input.tripId,
      candidateId: input.candidateId,
      evaluatedAt,
      assertions,
      completeness,
      degraded,
      degradedReasons,
      userFacts,
      evaluationMode: input.evaluationMode,
    });
    recordConstraintGatewayIngressFromReport(report);
    return report;
  }

  private async runProvider(
    provider: string,
    fn: () => Promise<ConstraintAssertion[]>,
  ): Promise<ConstraintAssertion[]> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(
        `[ConstraintGateway] ${provider} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      const failure = this.failurePolicy.buildProviderFailureAssertion({
        provider,
        tripId: 'unknown',
        error,
      });
      return [
        {
          assertionId: `provider_fail_${randomUUID()}`,
          constraintType: failure.constraintType,
          status: failure.status,
          severity: failure.severity,
          scope: { tripId: 'unknown' },
          reasonCode: failure.reasonCode,
          evidenceRefs: [],
          message: failure.message,
          evaluator: { engine: provider, version: '0.1.0' },
        },
      ];
    }
  }

  private buildReport(params: {
    tripId: string;
    candidateId?: string;
    evaluatedAt?: string;
    assertions: ConstraintAssertion[];
    completeness: CanonicalConstraintReport['completeness'];
    degraded: boolean;
    degradedReasons: string[];
    userFacts?: CanonicalConstraintReport['userFacts'];
    evaluationMode?: CanonicalConstraintReport['evaluationMode'];
  }): CanonicalConstraintReport {
    const assertions = params.assertions.map((a) =>
      a.scope.tripId === 'unknown' ? { ...a, scope: { ...a.scope, tripId: params.tripId } } : a,
    );

    const userFacts = params.userFacts;

    return {
      schemaId: 'tripnara.canonical_constraint_report@v1',
      evaluationId: `eval_${randomUUID()}`,
      tripId: params.tripId,
      candidateId: params.candidateId,
      evaluatedAt: params.evaluatedAt ?? new Date().toISOString(),
      assertions,
      completeness: params.completeness,
      overallStatus: deriveOverallStatus(assertions),
      degraded: params.degraded,
      degradedReasons: params.degradedReasons,
      userFacts,
      evaluationMode: params.evaluationMode,
    };
  }
}
