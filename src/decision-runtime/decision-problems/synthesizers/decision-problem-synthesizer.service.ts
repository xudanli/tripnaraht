/**
 * DecisionProblemSynthesizer — Assessment → Problem (Phase 3 SSOT).
 */

import { Injectable } from '@nestjs/common';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { ConstraintAssessment } from '../../constraints/contracts/constraint-assessment.types';
import { feasibilityIssuesToAssessments } from '../../constraints/adapters/feasibility-issue-to-assessment.adapter';
import type { EvaluationContextVersion } from '../../constraints/contracts/evaluation-context-version.types';
import { adaptFeasibilityIssueToProblem } from '../../../trips/decision-semantics/normalizers/from-feasibility-issue.adapter';
import { filterIssuesForDecisionEscalation } from '../../../trips/trip-constraint-solver/utils/feasibility-resolution-mode.util';
import type { DecisionProblemDetail } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  problemDedupeKeyFromDetail,
  synthesizeProblemFromAssessment,
} from './assessment-to-problem.util';

@Injectable()
export class DecisionProblemSynthesizerService {
  synthesizeFromAssessments(
    assessments: ConstraintAssessment[],
    input: {
      tripId: string;
      tripVersion: string;
      detectedAt: string;
      issueByRefId?: Map<string, FeasibilityIssueDto>;
    },
  ): DecisionProblemDetail[] {
    const merged = new Map<string, DecisionProblemDetail>();

    for (const assessment of assessments) {
      if (assessment.status === 'PASS') continue;

      const linkedIssue = input.issueByRefId?.get(assessment.sourceRef.refId);
      if (
        linkedIssue &&
        linkedIssue.resolutionMode &&
        linkedIssue.resolutionMode !== 'DECISION_REQUIRED'
      ) {
        continue;
      }
      const detail = linkedIssue
        ? (() => {
            const adapted = adaptFeasibilityIssueToProblem(
              linkedIssue,
              input.tripId,
              input.tripVersion,
              input.detectedAt,
            );
            return { ...adapted.problem, assertions: [adapted.assertion] };
          })()
        : synthesizeProblemFromAssessment(assessment, input);

      const key = problemDedupeKeyFromDetail(detail);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          assertionIds: [...new Set([...existing.assertionIds, ...detail.assertionIds])],
          assertions: [
            ...existing.assertions,
            ...detail.assertions.filter((a) => !existing.assertions.some((e) => e.id === a.id)),
          ],
        });
      } else {
        merged.set(key, detail);
      }
    }

    return [...merged.values()];
  }

  synthesizeFromFeasibilityIssues(
    issues: FeasibilityIssueDto[],
    input: {
      tripId: string;
      tripVersion: string;
      detectedAt: string;
      contextVersion: EvaluationContextVersion;
      evaluatedAt: string;
      policyRefsByIssueId?: Map<string, string[]>;
    },
  ): DecisionProblemDetail[] {
    const escalatedIssues = filterIssuesForDecisionEscalation(issues);
    const issueByRefId = new Map<string, FeasibilityIssueDto>();
    for (const issue of escalatedIssues) {
      issueByRefId.set(issue.id, issue);
    }

    const assessments = feasibilityIssuesToAssessments(escalatedIssues, {
      tripId: input.tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion: input.contextVersion,
      evaluatedAt: input.evaluatedAt,
      policyRefsByIssueId: input.policyRefsByIssueId,
    });

    return this.synthesizeFromAssessments(assessments, {
      tripId: input.tripId,
      tripVersion: input.tripVersion,
      detectedAt: input.detectedAt,
      issueByRefId,
    });
  }
}
