import type { ConstraintAssessment } from '../../constraints/contracts/constraint-assessment.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA } from '../../constraints/contracts/constraint-assessment.types';
import {
  assessmentStatusToEnforcement,
  resolveActionabilityFromAssessment,
  synthesizeProblemFromAssessment,
} from './assessment-to-problem.util';

describe('assessment-to-problem.util', () => {
  const assessment: ConstraintAssessment = {
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA,
    assessmentId: 'assess_feas_issue-1',
    evaluationMode: 'PLAN_VERIFY',
    status: 'BLOCK',
    semanticKey: 'EXCESSIVE_DAILY_LOAD',
    subjectRefs: ['item:abc'],
    affectedScope: { tripId: 'trip-1', dayIds: ['day-2'] },
    explanationCode: 'daily_drive',
    evidenceRefs: ['proof_1'],
    message: '每日驾驶上限：Day 2 超出 8 小时',
    contextVersion: {
      planVersionId: 'pv_1',
      policyVersion: 1,
      worldRevision: 'wr_1',
      rulePackVersion: 'pack_1',
    },
    evaluatedAt: '2026-07-03T00:00:00.000Z',
    sourceRef: { system: 'FEASIBILITY', refId: 'issue-1' },
    semanticsAssertionId: 'ca_issue-1',
  };

  it('CAS-018: maps BLOCK assessment to INFEASIBILITY problem with actionability', () => {
    expect(assessmentStatusToEnforcement('BLOCK')).toBe('BLOCK');
    const actionability = resolveActionabilityFromAssessment(assessment);
    expect(actionability.requiresAction).toBe(true);
    expect(actionability.allowedActions).toContain('REPAIR');

    const problem = synthesizeProblemFromAssessment(assessment, {
      tripId: 'trip-1',
      tripVersion: '3',
      detectedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(problem.id).toBe('dp_EXCESSIVE_DAILY_LOAD');
    expect(problem.semanticKey).toBe('EXCESSIVE_DAILY_LOAD');
    expect(problem.assertions[0].enforcement).toBe('BLOCK');
    expect(problem.affectedScope[0].scopeType).toBe('DAY');
  });
});
