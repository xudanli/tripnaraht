import type { ReputationSurveySubmission } from '@prisma/client';
import { computeUserReputationAggregate, buildTagCloud } from './reputation-aggregate.engine';

function makeSubmission(
  overrides: Partial<ReputationSurveySubmission> = {},
): ReputationSurveySubmission {
  return {
    id: 'sub-1',
    campaignId: 'camp-1',
    reviewerUserId: 'r1',
    revieweeUserId: 'target',
    q1Overall: 5,
    q2PaceSync: 5,
    q3Communication: 5,
    q4Spending: 4,
    q5WouldAgain: 5,
    submittedAt: new Date(),
    ...overrides,
  };
}

describe('reputation-aggregate.engine', () => {
  it('computes average stars and tag cloud from submissions', () => {
    const submissions = [
      makeSubmission({ q1Overall: 5, q5WouldAgain: 5, q3Communication: 5 }),
      makeSubmission({ id: 'sub-2', q1Overall: 4, q5WouldAgain: 4, q3Communication: 4 }),
    ];

    const aggregate = computeUserReputationAggregate('target', submissions);

    expect(aggregate.averageStars).toBe(4.5);
    expect(aggregate.surveyCount).toBe(2);
    expect(aggregate.tagCloud.length).toBeGreaterThan(0);
    expect(aggregate.internalRiskLevel).toBe('none');
  });

  it('flags safety warning after severe low scores', () => {
    const submissions = [
      makeSubmission({ q1Overall: 1, q3Communication: 1, q5WouldAgain: 1 }),
      makeSubmission({ id: 's2', q1Overall: 2, q3Communication: 2, q5WouldAgain: 1 }),
      makeSubmission({ id: 's3', q1Overall: 2, q3Communication: 1, q5WouldAgain: 2 }),
    ];

    const aggregate = computeUserReputationAggregate('target', submissions);
    expect(aggregate.internalRiskLevel).toBe('high');
    expect(aggregate.safetyWarning).toContain('放鸽子');
  });

  it('buildTagCloud extracts positive labels', () => {
    const tags = buildTagCloud([makeSubmission()]);
    expect(tags).toContain('神仙旅伴');
  });
});
