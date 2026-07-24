import {
  formatExplorationIssuesSummary,
  getComparePageHeadline,
  getExplorationIssueSourceKind,
  getGenerationSourceBadge,
  isOntologyConsumerIssue,
  shouldRegenerateCandidates,
} from './frontend-exploration-api.helpers';

describe('frontend-exploration-api.helpers', () => {
  it('returns badge for PERSONALIZED', () => {
    expect(getGenerationSourceBadge('PERSONALIZED')).toEqual({
      label: '已个性化',
      tone: 'primary',
    });
  });

  it('detects STALE for regenerate', () => {
    expect(shouldRegenerateCandidates('STALE')).toBe(true);
    expect(shouldRegenerateCandidates('READY')).toBe(false);
  });

  it('returns mode-specific compare headline', () => {
    expect(getComparePageHeadline('PERSONALIZED')).toContain('个性化');
    expect(getComparePageHeadline('ENGINE')).toContain('引擎');
  });

  it('detects ontology issue ids and formats summary', () => {
    expect(isOntologyConsumerIssue({ issueId: 'ontology:VEHICLE_CAPABILITY_MISMATCH' })).toBe(true);
    expect(getExplorationIssueSourceKind({ issueId: 'ontology:ENTRY_ELIGIBILITY_UNKNOWN' })).toBe(
      'ontology',
    );
    expect(
      formatExplorationIssuesSummary({
        displayedIssues: [],
        totalIssueCount: 2,
        blockerIssueCount: 1,
        ontologyIssueCount: 1,
        displayPolicy: { maxIssues: 1, preferredSeverity: 'BLOCK' },
      }),
    ).toContain('本体约束');
  });
});
