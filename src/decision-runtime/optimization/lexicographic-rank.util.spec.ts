import { rankCandidatesLexicographic } from './lexicographic-rank.util';
import { icelandMinimalMultiCandidateFixture } from '../../decision-lab/fixtures/iceland-minimal.fixture';

describe('lexicographic-rank.util', () => {
  it('prefers lower L2 drive load over higher utility hint', () => {
    const ranked = rankCandidatesLexicographic({
      candidates: icelandMinimalMultiCandidateFixture(),
    });
    expect(ranked[0]?.candidateId).toBe('balanced');
  });
});
