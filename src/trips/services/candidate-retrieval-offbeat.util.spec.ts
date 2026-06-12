import {
  DEFAULT_OFF_BEAT_RATIO,
  enforceOffBeatQuota,
  isOffBeatCandidate,
  medianPopularity,
  resolveOffBeatMinCount,
} from './candidate-retrieval-offbeat.util';
import type { CandidatePlace } from './candidate-retrieval.engine';

function place(id: number, pop: number, tags: string[] = []): CandidatePlace & { compositeScore: number } {
  return {
    id,
    nameCN: `P${id}`,
    type: 'ATTRACTION',
    category: 'ATTRACTION',
    lat: 0,
    lng: 0,
    popularity: pop,
    tags,
    compositeScore: pop,
  };
}

describe('candidate-retrieval-offbeat.util', () => {
  it('isOffBeatCandidate 识别标签与低热度', () => {
    expect(isOffBeatCandidate({ tags: ['小众机位'], popularity: 8 }, 6)).toBe(true);
    expect(isOffBeatCandidate({ tags: [], popularity: 2 }, 6)).toBe(true);
    expect(isOffBeatCandidate({ tags: [], popularity: 9 }, 6)).toBe(false);
  });

  it('medianPopularity 计算中位数', () => {
    expect(medianPopularity([{ popularity: 2 }, { popularity: 4 }, { popularity: 10 }])).toBe(4);
  });

  it('resolveOffBeatMinCount 至少 1 个', () => {
    expect(resolveOffBeatMinCount(10, DEFAULT_OFF_BEAT_RATIO)).toBe(2);
    expect(resolveOffBeatMinCount(3, DEFAULT_OFF_BEAT_RATIO)).toBe(1);
  });

  it('enforceOffBeatQuota 替换热门项以满足配额', () => {
    const selected = [place(1, 9), place(2, 8), place(3, 7), place(4, 6), place(5, 5)];
    const offBeatPool = [place(99, 2, ['秘境']), place(98, 1, ['local secret'])];
    const out = enforceOffBeatQuota(selected, offBeatPool, 2);
    const offBeatCount = out.filter((p) => isOffBeatCandidate(p, medianPopularity(out))).length;
    expect(offBeatCount).toBeGreaterThanOrEqual(2);
  });
});
