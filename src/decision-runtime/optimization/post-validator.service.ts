/**
 * Post-solver constraint recheck — solver output must pass Gateway before becoming authoritative.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import { Injectable } from '@nestjs/common';
import type { DecisionCandidate } from '../contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { OptimizationResult } from '../contracts/optimization-result';

export interface PostValidationInput {
  tripId: string;
  snapshotId: string;
  candidate: DecisionCandidate;
  priorReport: CanonicalConstraintReport;
}

export interface PostValidationResult {
  passed: boolean;
  report: CanonicalConstraintReport;
  blockReasons: string[];
}

@Injectable()
export class CanonicalSolutionPostValidatorService {
  /**
   * Skeleton: delegates to ConstraintEvaluationGateway in Sprint 5.
   * Until wired, accepts when prior report has no non-overridable BLOCK.
   */
  async validate(input: PostValidationInput): Promise<PostValidationResult> {
    const blocks = input.priorReport.assertions.filter(
      (a) => a.status === 'BLOCK' && a.overridable === false,
    );
    return {
      passed: blocks.length === 0,
      report: input.priorReport,
      blockReasons: blocks.map((b) => b.reasonCode),
    };
  }

  async validateResult(result: OptimizationResult): Promise<OptimizationResult> {
    return result;
  }
}
