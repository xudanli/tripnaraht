/**
 * Mandatory L1 feasibility gate — safety/regulatory constraints before L2–L5 optimization.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { OptimizationProblem } from '../contracts/optimization-problem';
import type { ConstraintEvaluation } from '../contracts/constraint-evaluation';
import { isLegacyFeasibleFromReport } from '../constraints/contracts/canonical-constraint-report';

export interface MandatoryFeasibilityGateResult {
  passed: boolean;
  blocking: ConstraintEvaluation[];
  reasonCodes: string[];
}

export function runMandatoryFeasibilityGate(
  problem: OptimizationProblem,
): MandatoryFeasibilityGateResult {
  const reportsById = problem.constraintReportsByCandidateId;
  const multiCandidate =
    problem.candidates.length > 1 &&
    reportsById != null &&
    Object.keys(reportsById).length > 0;

  if (multiCandidate) {
    const hasFeasibleCandidate = problem.candidates.some((c) => {
      const report = reportsById[c.candidateId] ?? problem.constraintReport;
      return isLegacyFeasibleFromReport(report);
    });
    if (!hasFeasibleCandidate) {
      return {
        passed: false,
        blocking: [],
        reasonCodes: ['NO_FEASIBLE_CANDIDATE'],
      };
    }
    return { passed: true, blocking: [], reasonCodes: [] };
  }

  const blocking = problem.mandatoryEvaluations.filter(isMandatoryBlock);

  if (blocking.length > 0) {
    return {
      passed: false,
      blocking,
      reasonCodes: blocking.map((b) => b.reasonCode),
    };
  }

  const reportBlocks = problem.constraintReport.assertions.filter(
    (a) =>
      (a.status === 'BLOCK' || a.status === 'REQUIRES_VERIFICATION') &&
      a.overridable === false,
  );

  if (reportBlocks.length > 0) {
    return {
      passed: false,
      blocking: [],
      reasonCodes: reportBlocks.map((a) => a.reasonCode),
    };
  }

  return { passed: true, blocking: [], reasonCodes: [] };
}

function isMandatoryBlock(eval_: ConstraintEvaluation): boolean {
  if (eval_.tier !== 'L1') return false;
  if (eval_.relaxable) return false;
  return (
    eval_.evaluationStatus === 'BLOCK' ||
    eval_.actionPolicy === 'REJECT' ||
    (eval_.evaluationStatus === 'REQUIRES_VERIFICATION' && eval_.mandatory)
  );
}
