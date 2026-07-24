import {
  skillIdToAgentSkillsName,
  validateAgentSkillsSkill,
  buildAgentSkillsDescription,
  isValidAgentSkillsName,
} from './agent-skills-compat.util';
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';

function skill(overrides: Partial<EvolvableSkill> & Pick<EvolvableSkill, 'skillId'>): EvolvableSkill {
  return {
    name: overrides.name ?? overrides.skillId,
    version: 1,
    content: '',
    body: '# Test\n\nStep 1.',
    frontmatter: {
      skill_id: overrides.skillId,
      name: overrides.name ?? overrides.skillId,
      version: 1,
    },
    tags: [],
    applicableScenarios: [],
    filePath: '/tmp/x.md',
    artifactType: 'markdown_skill',
    ...overrides,
  };
}

describe('agent-skills-compat.util', () => {
  it('maps skill_id to kebab name', () => {
    expect(skillIdToAgentSkillsName('api_calling')).toBe('api-calling');
    expect(skillIdToAgentSkillsName('country_pack.IS')).toBe('country-pack-is');
    expect(isValidAgentSkillsName('api-calling')).toBe(true);
    expect(isValidAgentSkillsName('API')).toBe(false);
  });

  it('builds description with when-clause', () => {
    const desc = buildAgentSkillsDescription(
      skill({
        skillId: 'api_calling',
        name: 'API 调用规范',
        tags: ['http'],
        applicableScenarios: ['REST API'],
      }),
    );
    expect(desc).toContain('API 调用规范');
    expect(desc).toContain('REST API');
    expect(desc.length).toBeLessThanOrEqual(1024);
  });

  it('validates export-ready skill', () => {
    const issues = validateAgentSkillsSkill(
      skill({ skillId: 'api_calling', name: 'API' }),
      { directoryName: 'api-calling' },
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
