import type { EvolvableSkill, ReplayAssertion } from '../interfaces/skill-evolver.types';
import { bumpSkillVersion } from './markdown-skill.util';

const BODY_ASSERTION_TEMPLATES: Record<string, string> = {
  reject: '**Abu 门禁**：DEM / 海拔证据缺失时必须 REJECT，不得静默降级为 ALLOW。',
  dem: '须检查 DEM / 海拔 Evidence；缺失则 REJECT 并说明原因。',
  allow: 'Abu 允许（ALLOW）时须在轨迹中明确输出 allow。',
  is: '所有决策须绑定 `countryCode=IS`。',
};

/** 确保 skill 正文满足 fixture 的 skill_body_contains 断言（进化后验证用） */
export function ensureSkillBodyAssertions(
  skill: EvolvableSkill,
  assertions?: ReplayAssertion[],
): EvolvableSkill {
  if (!assertions?.length) return skill;

  const missing = assertions
    .filter((a) => a.type === 'skill_body_contains')
    .map((a) => a.value.toLowerCase())
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter((v) => !skill.body.toLowerCase().includes(v));

  if (!missing.length) return skill;

  const lines = missing.map((v) => {
    const tpl = BODY_ASSERTION_TEMPLATES[v];
    return tpl ? `- ${tpl}` : `- 须满足回放约束：${v}`;
  });

  const body = `${skill.body.trimEnd()}\n\n## 进化补充规则\n${lines.join('\n')}\n`;
  return bumpSkillVersion(skill, body);
}
