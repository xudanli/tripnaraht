/**
 * Link DecisionProblem ↔ ConstraintAssessment for trace / SSOT migration.
 */

import type { DecisionProblem } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type {
  ConstraintAssessment,
  ConstraintAssessmentTraceBundle,
} from '../contracts/constraint-assessment.types';

/** Map semantics assertion id (ca_*) to assessment id (assess_feas_*) */
export function semanticsAssertionIdToAssessmentId(semanticsAssertionId: string): string | undefined {
  if (semanticsAssertionId.startsWith('ca_')) {
    const issueId = semanticsAssertionId.slice(3);
    return `assess_feas_${issueId}`;
  }
  return undefined;
}

export function linkAssessmentsToProblems(
  assessments: ConstraintAssessment[],
  problems: DecisionProblem[],
): ConstraintAssessment[] {
  const byAssessmentId = new Map(assessments.map((a) => [a.assessmentId, a]));
  const bySemanticKey = new Map<string, ConstraintAssessment[]>();
  for (const a of assessments) {
    const list = bySemanticKey.get(a.semanticKey) ?? [];
    list.push(a);
    bySemanticKey.set(a.semanticKey, list);
  }

  for (const problem of problems) {
    const linkedIds = new Set<string>();

    for (const assertionId of problem.assertionIds ?? []) {
      const mapped = semanticsAssertionIdToAssessmentId(assertionId);
      if (mapped && byAssessmentId.has(mapped)) {
        linkedIds.add(mapped);
      }
    }

    if (problem.semanticKey) {
      for (const a of bySemanticKey.get(problem.semanticKey) ?? []) {
        linkedIds.add(a.assessmentId);
      }
    }

    for (const ref of problem.sourceRefs ?? []) {
      if (ref.system === 'FEASIBILITY') {
        const id = `assess_feas_${ref.refId}`;
        if (byAssessmentId.has(id)) linkedIds.add(id);
      }
    }

    for (const assessmentId of linkedIds) {
      const row = byAssessmentId.get(assessmentId);
      if (!row) continue;
      const problemIds = new Set(row.problemIds ?? []);
      problemIds.add(problem.id);
      row.problemIds = [...problemIds];
    }
  }

  return [...byAssessmentId.values()];
}

export function problemTraceRows(
  problems: DecisionProblem[],
  assessments: ConstraintAssessment[],
): ConstraintAssessmentTraceBundle['problems'] {
  const assessmentIdsByProblem = new Map<string, string[]>();
  for (const a of assessments) {
    for (const pid of a.problemIds ?? []) {
      const list = assessmentIdsByProblem.get(pid) ?? [];
      list.push(a.assessmentId);
      assessmentIdsByProblem.set(pid, list);
    }
  }

  return problems.map((p) => ({
    problemId: p.id,
    semanticKey: p.semanticKey,
    title: p.title,
    detectedBy: p.detectedBy,
    assessmentIds: [...new Set(assessmentIdsByProblem.get(p.id) ?? [])],
    assertionIds: p.assertionIds ?? [],
  })  );
}

export function findAssessmentsBySemanticKey(
  assessments: ConstraintAssessment[],
  semanticKey: string,
): ConstraintAssessment[] {
  const key = semanticKey.trim();
  return assessments.filter(
    (a) =>
      a.semanticKey === key ||
      a.assessmentId.includes(key) ||
      a.sourceRef.refId === key,
  );
}
