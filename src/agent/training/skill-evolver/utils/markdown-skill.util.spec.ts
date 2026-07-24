import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSkillMarkdown, serializeSkillMarkdown, bumpSkillVersion } from './markdown-skill.util';

describe('markdown-skill.util', () => {
  const sample = `---
skill_id: api_calling
name: API 调用规范
version: 2
parent_version: 1
tags: [api, http]
applicable_scenarios:
  - 调用 REST API
---

# Title

## 步骤
1. 检查参数
`;

  it('parses frontmatter and body', () => {
    const skill = parseSkillMarkdown(sample, '/tmp/api_calling.md');
    expect(skill.skillId).toBe('api_calling');
    expect(skill.version).toBe(2);
    expect(skill.parentVersion).toBe(1);
    expect(skill.tags).toEqual(['api', 'http']);
    expect(skill.applicableScenarios).toEqual(['调用 REST API']);
    expect(skill.body).toContain('# Title');
  });

  it('round-trips serialize', () => {
    const skill = parseSkillMarkdown(sample, '/tmp/x.md');
    const raw = serializeSkillMarkdown({ frontmatter: skill.frontmatter, body: skill.body });
    const again = parseSkillMarkdown(raw, '/tmp/x.md');
    expect(again.skillId).toBe(skill.skillId);
    expect(again.version).toBe(skill.version);
  });

  it('bumps version', () => {
    const skill = parseSkillMarkdown(sample, '/tmp/x.md');
    const next = bumpSkillVersion(skill, skill.body + '\n\n## 新规则\n- foo');
    expect(next.version).toBe(3);
    expect(next.parentVersion).toBe(2);
  });
});

describe('SkillRegistryService integration', () => {
  it('loads sample api_calling from data/skill-evolver when present', () => {
    const base = path.join(process.cwd(), 'data/skill-evolver/current/api_calling.md');
    if (!fs.existsSync(base)) return;
    const skill = parseSkillMarkdown(fs.readFileSync(base, 'utf-8'), base);
    expect(skill.skillId).toBe('api_calling');
  });
});
