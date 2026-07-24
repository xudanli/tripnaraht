import {
  buildReadinessPackSkillEvolverContextBlock,
  resolveSkillEvolverCountryPackBlock,
} from './country-pack-evolver-markdown.util';
import { mergeSkillEvolverIntoPack } from './sync-country-pack-readiness.util';
import type { ReadinessPack } from '../../../../trips/readiness/types/readiness-pack.types';

describe('sync country pack readiness util', () => {
  it('mergeSkillEvolverIntoPack attaches extension', () => {
    const base: ReadinessPack = {
      packId: 'pack.is.iceland',
      destinationId: 'IS',
      displayName: 'Iceland',
      version: '1.0.0',
      lastReviewedAt: '2026-01-01T00:00:00Z',
      geo: { countryCode: 'IS', lat: 0, lng: 0 },
      supportedSeasons: ['summer'],
      rules: [],
      checklists: [],
    };
    const merged = mergeSkillEvolverIntoPack(base, 'reject dem', 'IS');
    expect(merged.skillEvolver?.markdown).toContain('reject');
  });

  it('builds context block from packData.skillEvolver', () => {
    const block = buildReadinessPackSkillEvolverContextBlock('IS', {
      skillEvolver: { markdown: 'DEM missing must REJECT', syncedAt: '2026-01-01' },
    });
    expect(block).not.toBeNull();
    expect(block!.text).toContain('REJECT');
    expect(block!.data?.source).toBe('readiness_pack');
  });

  it('resolve prefers env inject over db when env set', () => {
    const prev = process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK;
    process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK = 'IS';
    try {
      const block = resolveSkillEvolverCountryPackBlock('IS', {
        skillEvolver: { markdown: 'from-db-only' },
      });
      if (block) {
        expect(block.data?.source).toBe('filesystem');
      }
    } finally {
      if (prev === undefined) delete process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK;
      else process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK = prev;
    }
  });
});
