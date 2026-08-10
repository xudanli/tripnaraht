/**
 * Post-solver constraint recheck — solver output must pass Gateway before becoming authoritative.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import { Injectable } from '@nestjs/common';
import type { DecisionCandidate } from '../contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { OptimizationResult } from '../contracts/optimization-result';
import type {
  DecisionScope,
  ScopeMutationCandidate,
} from '../contracts/decision-scope.types';
import { evaluateDecisionScopeBoundRun } from '../verification/evaluate-decision-scope.util';
import { deriveOverallStatus } from '../constraints/assertion-normalizer.service';

export interface PostValidationInput {
  tripId: string;
  snapshotId: string;
  candidate: DecisionCandidate;
  priorReport: CanonicalConstraintReport;
  /** Authority Consistency — bind DecisionScope for post-solver verification. */
  decisionScope?: DecisionScope;
  scopeMutationCandidate?: ScopeMutationCandidate;
}

export interface PostValidationResult {
  passed: boolean;
  report: CanonicalConstraintReport;
  blockReasons: string[];
}

@Injectable()
export class CanonicalSolutionPostValidatorService {
  /**
   * Recheck prior Gateway report + optional DecisionScope binding.
   * Scope violations fail closed (cannot become authoritative).
   */
  async validate(input: PostValidationInput): Promise<PostValidationResult> {
    const blocks = input.priorReport.assertions.filter(
      (a) => a.status === 'BLOCK' && a.overridable === false,
    );
    const blockReasons = blocks.map((b) => b.reasonCode);
    let report = input.priorReport;

    if (input.decisionScope) {
      const scopeEval = evaluateDecisionScopeBoundRun({
        tripId: input.tripId,
        scope: input.decisionScope,
        consumers: [
          { name: 'decision', snapshotId: input.decisionScope.snapshotId },
          { name: 'solver', snapshotId: input.snapshotId },
          { name: 'verification', snapshotId: input.decisionScope.snapshotId },
        ],
        candidate: input.scopeMutationCandidate,
      });
      if (!scopeEval.ok) {
        blockReasons.push(...scopeEval.reasons);
        const assertions = [
          ...input.priorReport.assertions,
          ...scopeEval.assertions,
        ];
        report = {
          ...input.priorReport,
          assertions,
          overallStatus: deriveOverallStatus(assertions),
        };
      }
    }

    return {
      passed: blockReasons.length === 0,
      report,
      blockReasons,
    };
  }

  async validateResult(result: OptimizationResult): Promise<OptimizationResult> {
    return result;
  }
}
