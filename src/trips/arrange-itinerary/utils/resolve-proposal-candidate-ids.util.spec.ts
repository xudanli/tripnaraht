import { resolveProposalCandidateIds } from './resolve-proposal-candidate-ids.util';

describe('resolveProposalCandidateIds', () => {
  it('reads payload.candidateIds', () => {
    expect(
      resolveProposalCandidateIds({ candidateIds: ['a', 'b'] }),
    ).toEqual(['a', 'b']);
  });

  it('falls back to top-level when payload omits ids', () => {
    expect(resolveProposalCandidateIds({}, ['c'])).toEqual(['c']);
  });

  it('prefers payload over top-level', () => {
    expect(
      resolveProposalCandidateIds({ candidateIds: ['p'] }, ['t']),
    ).toEqual(['p']);
  });

  it('accepts candidate_ids snake_case', () => {
    expect(
      resolveProposalCandidateIds({ candidate_ids: ['s1'] }),
    ).toEqual(['s1']);
  });

  it('returns undefined when payload is missing (no throw)', () => {
    expect(resolveProposalCandidateIds(undefined)).toBeUndefined();
    expect(resolveProposalCandidateIds(null)).toBeUndefined();
  });
});
