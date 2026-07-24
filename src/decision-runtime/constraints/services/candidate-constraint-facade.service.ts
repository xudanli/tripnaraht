/**
 * Phase 2 — Candidate filtering via ConstraintEvaluationGateway (CANDIDATE_FILTER).
 */

import { Injectable } from '@nestjs/common';
import type { EvaluatePlanInput } from '../contracts/evaluate-input.types';
import type { CanonicalConstraintReport } from '../contracts/canonical-constraint-report';
import { ConstraintEvaluationGatewayService } from '../constraint-evaluation.gateway.service';
import { mapReportToFeasibilityResult } from '../feasibility-result.mapper';
import type { FeasibilityResult } from '../../../trips/decision/constraints/constraint-engine.service';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import { canonicalReportToAssessments } from '../adapters/assertion-to-assessment.adapter';

export interface CandidateFeasibilityResult extends FeasibilityResult {
  assessments: ConstraintAssessment[];
}

@Injectable()
export class CandidateConstraintFacade {
  constructor(private readonly gateway: ConstraintEvaluationGatewayService) {}

  async evaluateCandidate(input: EvaluatePlanInput): Promise<CandidateFeasibilityResult> {
    const report = await this.gateway.evaluatePlan({
      ...input,
      evaluationMode: input.evaluationMode ?? 'CANDIDATE_FILTER',
    });
    const base = mapReportToFeasibilityResult(report);
    const assessments = canonicalReportToAssessments(report.assertions, {
      tripId: input.tripId,
      evaluationMode: report.evaluationMode ?? 'CANDIDATE_FILTER',
      contextVersion: {
        planVersionId: input.candidateId ? `candidate_${input.candidateId}` : `plan_${input.tripId}`,
        policyVersion: 0,
        worldRevision: 'candidate',
        rulePackVersion: input.countryCode ? `destination.${input.countryCode.toLowerCase()}@active` : 'unknown',
      },
      evaluatedAt: report.evaluatedAt,
    });
    return { ...base, canonicalReport: report, assessments };
  }

  async isFeasible(input: EvaluatePlanInput): Promise<boolean> {
    const result = await this.evaluateCandidate(input);
    return result.feasible;
  }
}
