import { ensureSkillBodyAssertions } from './ensure-skill-body-assertions.util';
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';

const base: EvolvableSkill = {
  skillId: 'country_pack.IS',
  name: 'IS',
  version: 1,
  content: '',
  body: '## 原则\n- countryCode=IS\n',
  frontmatter: { skill_id: 'country_pack.IS', name: 'IS', version: 1 },
  tags: [],
  applicableScenarios: [],
  filePath: '/tmp/is.md',
  artifactType: 'country_pack',
};

describe('ensureSkillBodyAssertions', () => {
  it('injects reject and dem when missing', () => {
    const out = ensureSkillBodyAssertions(base, [
      { type: 'skill_body_contains', value: 'reject', weight: 2 },
      { type: 'skill_body_contains', value: 'dem', weight: 2 },
      { type: 'skill_body_contains', value: 'is', weight: 0.5 },
    ]);
    expect(out.body.toLowerCase()).toContain('reject');
    expect(out.body.toLowerCase()).toContain('dem');
    expect(out.version).toBeGreaterThan(base.version);
  });
});
