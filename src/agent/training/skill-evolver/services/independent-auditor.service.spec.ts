import { IndependentAuditorService, AUDIT_RULES } from './independent-auditor.service';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';

describe('IndependentAuditorService', () => {
  const auditor = new IndependentAuditorService(new SkillEvolverLlmHelper(undefined));

  const base: EvolvableSkill = {
    skillId: 'test',
    name: 'Test',
    version: 1,
    content: '',
    body: '## 规则\n- 总是验证输入\n',
    frontmatter: { skill_id: 'test', name: 'Test', version: 1 },
    tags: [],
    applicableScenarios: [],
    filePath: '/tmp/test.md',
    artifactType: 'markdown_skill',
  };

  it('fails on secret leakage heuristic', async () => {
    const bad: EvolvableSkill = {
      ...base,
      body: 'api_key: "sk-live-abc123"',
    };
    const result = await auditor.audit(bad, base);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.ruleId === 'R6')).toBe(true);
  });

  it('passes safe minor edit', async () => {
    const newSkill: EvolvableSkill = {
      ...base,
      body: base.body + '\n- 记录 request_id\n',
    };
    const result = await auditor.audit(newSkill, base);
    expect(result.passed).toBe(true);
  });

  it('relaxed mode ignores LLM-only high severity noise when heuristic passes', async () => {
    const newSkill: EvolvableSkill = {
      ...base,
      body: base.body + '\n- REJECT when DEM missing\n',
    };
    const llm = {
      isAvailable: () => true,
      structured: async () => ({
        passed: false,
        issues: AUDIT_RULES.map((r) => ({
          rule_id: r.id,
          severity: r.severity,
          status: 'FAIL',
          description: 'llm nitpick',
        })),
      }),
      text: async (_p: string, f: string) => f,
    };
    const relaxedAuditor = new IndependentAuditorService(llm as any);
    const result = await relaxedAuditor.audit(newSkill, base, { relaxed: true });
    expect(result.passed).toBe(true);
  });
});
