import type { ReadinessPack } from '../../../../trips/readiness/types/readiness-pack.types';

export type SkillEvolverPackExtension = {
  markdown: string;
  syncedAt: string;
  source: 'skill-evolver';
  countryCode: string;
};

export function mergeSkillEvolverIntoPack(
  pack: ReadinessPack,
  markdown: string,
  countryCode: string,
): ReadinessPack & { skillEvolver?: SkillEvolverPackExtension } {
  return {
    ...pack,
    skillEvolver: {
      markdown: markdown.slice(0, 50000),
      syncedAt: new Date().toISOString(),
      source: 'skill-evolver',
      countryCode: countryCode.toUpperCase(),
    },
  };
}
