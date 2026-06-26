import { normalizeIssueId, resolveIssueIdToBlockerId } from './trip-revision.util';

describe('trip-revision issue id mapping', () => {
  it('preserves transport finding ids for repair-options lookup', () => {
    const raw = 'transport-seg-2-long_distance';
    const issueId = normalizeIssueId(raw);
    expect(issueId).toBe('issue-transport-seg-2-long_distance');
    expect(resolveIssueIdToBlockerId(issueId)).toBe(raw);
  });

  it('maps issue-transport-seg-8-long_distance back to readiness blocker id', () => {
    expect(resolveIssueIdToBlockerId('issue-transport-seg-8-long_distance')).toBe(
      'transport-seg-8-long_distance',
    );
  });

  it('maps coverage-gap ids bidirectionally', () => {
    expect(normalizeIssueId('coverage-gap:gap-1')).toBe('issue-gap-1');
    expect(resolveIssueIdToBlockerId('issue-gap-1')).toBe('coverage-gap:gap-1');
  });
});
