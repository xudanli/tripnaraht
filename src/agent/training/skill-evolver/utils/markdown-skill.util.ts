import type { EvolvableSkill, SkillFrontmatter } from '../interfaces/skill-evolver.types';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseYamlLine(line: string): { key: string; value: string } | null {
  const m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
  if (!m) return null;
  return { key: m[1], value: m[2].trim() };
}

function parseInlineList(raw: string): string[] {
  const t = raw.trim();
  if (!t.startsWith('[') || !t.endsWith(']')) return t ? [t] : [];
  return t
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** 轻量 frontmatter 解析（无 yaml 依赖） */
export function parseSkillMarkdown(raw: string, filePath: string): EvolvableSkill {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`技能文件缺少 YAML frontmatter: ${filePath}`);
  }
  const [, yamlBlock, body] = match;
  const fm: Record<string, string | string[] | number> = {};
  let listKey: string | null = null;

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('- ') && listKey) {
      const arr = (fm[listKey] as string[]) ?? [];
      arr.push(trimmed.slice(2).trim());
      fm[listKey] = arr;
      continue;
    }
    listKey = null;
    const parsed = parseYamlLine(trimmed);
    if (!parsed) continue;
    const { key, value } = parsed;
    if (value === '' || value === '|') {
      listKey = key;
      fm[key] = [];
      continue;
    }
    if (key === 'version' || key === 'parent_version') {
      fm[key] = Number(value);
    } else if (value.startsWith('[')) {
      fm[key] = parseInlineList(value);
    } else {
      fm[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  const skillId = String(fm.skill_id ?? '');
  if (!skillId) throw new Error(`frontmatter 缺少 skill_id: ${filePath}`);

  const frontmatter: SkillFrontmatter = {
    skill_id: skillId,
    name: String(fm.name ?? skillId),
    version: Number(fm.version ?? 1),
    created_at: fm.created_at as string | undefined,
    updated_at: fm.updated_at as string | undefined,
    parent_version: fm.parent_version as number | undefined,
    tags: (fm.tags as string[]) ?? [],
    applicable_scenarios: (fm.applicable_scenarios as string[]) ?? [],
    artifact_type: fm.artifact_type as SkillFrontmatter['artifact_type'],
    country_code: fm.country_code as string | undefined,
  };

  const artifactType = frontmatter.artifact_type ?? 'markdown_skill';

  return {
    skillId,
    name: frontmatter.name,
    version: frontmatter.version,
    parentVersion: frontmatter.parent_version,
    content: raw,
    body: body.trim(),
    frontmatter: { ...frontmatter, artifact_type: artifactType },
    tags: frontmatter.tags ?? [],
    applicableScenarios: frontmatter.applicable_scenarios ?? [],
    filePath,
    artifactType,
    countryCode: frontmatter.country_code,
  };
}

export function serializeSkillMarkdown(skill: {
  frontmatter: SkillFrontmatter;
  body: string;
}): string {
  const fm = skill.frontmatter;
  const lines: string[] = ['---', `skill_id: ${fm.skill_id}`, `name: ${fm.name}`, `version: ${fm.version}`];
  if (fm.created_at) lines.push(`created_at: ${fm.created_at}`);
  if (fm.updated_at) lines.push(`updated_at: ${fm.updated_at}`);
  if (fm.parent_version != null) lines.push(`parent_version: ${fm.parent_version}`);
  if (fm.tags?.length) lines.push(`tags: [${fm.tags.join(', ')}]`);
  if (fm.applicable_scenarios?.length) {
    lines.push('applicable_scenarios:');
    for (const s of fm.applicable_scenarios) lines.push(`  - ${s}`);
  }
  if (fm.artifact_type) lines.push(`artifact_type: ${fm.artifact_type}`);
  if (fm.country_code) lines.push(`country_code: ${fm.country_code}`);
  lines.push('---', '', skill.body.trim(), '');
  return lines.join('\n');
}

export function bumpSkillVersion(
  skill: EvolvableSkill,
  newBody: string,
): EvolvableSkill {
  const now = new Date().toISOString();
  const frontmatter: SkillFrontmatter = {
    ...skill.frontmatter,
    version: skill.version + 1,
    parent_version: skill.version,
    updated_at: now,
    created_at: skill.frontmatter.created_at ?? now,
  };
  const content = serializeSkillMarkdown({ frontmatter, body: newBody });
  return parseSkillMarkdown(content, skill.filePath);
}
