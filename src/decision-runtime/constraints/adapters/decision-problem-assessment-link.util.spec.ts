import type { DecisionProblem } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA } from '../contracts/constraint-assessment.types';
import { linkAssessmentsToProblems } from './decision-problem-assessment-link.util';

describe('decision-problem-assessment-link.util', () => {
  const assessment: ConstraintAssessment = {
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA,
    assessmentId: 'assess_feas_issue-1',
    evaluationMode: 'PLAN_VERIFY',
    status: 'BLOCK',
    semanticKey: 'EXCESSIVE_DAILY_LOAD',
    subjectRefs: [],
    affectedScope: { tripId: 'trip-1' },
    explanationCode: 'daily_drive',
    evidenceRefs: [],
    message: 'too long',
    contextVersion: {
      planVersionId: 'p1',
      policyVersion: 1,
      worldRevision: 'w1',
      rulePackVersion: 'r1',
    },
    evaluatedAt: '2026-07-03T00:00:00.000Z',
    sourceRef: { system: 'FEASIBILITY', refId: 'issue-1' },
    semanticsAssertionId: 'ca_issue-1',
  };

  const problem: DecisionProblem = {
    id: 'dp_EXCESSIVE_DAILY_LOAD',
    tripId: 'trip-1',
    type: 'INFEASIBILITY',
    title: 'Daily drive',
    description: 'too long',
    detectedBy: 'FEASIBILITY',
    detectedAt: '2026-07-03T00:00:00.000Z',
    tripVersion: 'v1',
    affectedScope: [],
    status: 'OPEN',
    semanticKey: 'EXCESSIVE_DAILY_LOAD',
    sourceRefs: [{ system: 'FEASIBILITY', refId: 'issue-1' }],
    assertionIds: ['ca_issue-1'],
  };

  it('CAS-003: links problem to assessment by assertion and semanticKey', () => {
    const linked = linkAssessmentsToProblems([assessment], [problem]);
    expect(linked[0].problemIds).toEqual(['dp_EXCESSIVE_DAILY_LOAD']);
  });
});
