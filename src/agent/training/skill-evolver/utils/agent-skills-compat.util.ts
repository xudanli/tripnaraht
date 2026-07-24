/**
 * TripNARA SkillEvolver ↔ agentskills.io 互操作
 * @see https://agentskills.io/specification.md
 */
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';

export type AgentSkillsValidationSeverity = 'error' | 'warning';

export interface AgentSkillsValidationIssue {
  severity: AgentSkillsValidationSeverity;
  rule: string;
  message: string;
}

export interface AgentSkillsExportRecord {
  tripnaraSkillId: string;
  agentSkillsName: string;
  exportDir: string;
  skillMdPath: string;
}

const AGENT_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** skill_id → agentskills.io `name`（kebab-case，≤64） */
export function skillIdToAgentSkillsName(skillId: string): string {
  const raw = skillId
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return raw.slice(0, 64).replace(/-$/, '');
}

export function isValidAgentSkillsName(name: string): boolean {
  if (!name || name.length > 64) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.includes('--')) return false;
  return AGENT_NAME_RE.test(name);
}

/** 构建符合 spec 的 description（what + when + 关键词） */
export function buildAgentSkillsDescription(skill: EvolvableSkill): string {
  const whenParts = [
    ...(skill.applicableScenarios ?? []),
    ...(skill.tags ?? []),
  ].filter(Boolean);
  const when =
    whenParts.length > 0
      ? ` Use when: ${whenParts.slice(0, 6).join('; ')}.`
      : '';
  const base = `${skill.name.trim()}.${when}`.replace(/\s+/g, ' ').trim();
  if (base.length <= 1024) return base;
  return `${base.slice(0, 1020)}…`;
}

export interface AgentSkillsFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
}

export function toAgentSkillsFrontmatter(skill: EvolvableSkill): AgentSkillsFrontmatter {
  const metadata: Record<string, string> = {
    'tripnara-skill-id': skill.skillId,
    'tripnara-version': String(skill.version),
    'tripnara-artifact-type': skill.artifactType,
  };
  if (skill.countryCode) metadata['tripnara-country-code'] = skill.countryCode;
  if (skill.parentVersion != null) metadata['tripnara-parent-version'] = String(skill.parentVersion);

  return {
    name: skillIdToAgentSkillsName(skill.skillId),
    description: buildAgentSkillsDescription(skill),
    license: 'Proprietary. TripNARA internal skill.',
    compatibility: 'TripNARA SkillEvolver markdown skill; loadable in Claude Code / Cursor Agent Skills.',
    metadata,
  };
}

function serializeAgentSkillsYaml(fm: AgentSkillsFrontmatter): string {
  const lines: string[] = [
    '---',
    `name: ${fm.name}`,
    `description: ${yamlQuote(fm.description)}`,
  ];
  if (fm.license) lines.push(`license: ${yamlQuote(fm.license)}`);
  if (fm.compatibility) lines.push(`compatibility: ${yamlQuote(fm.compatibility)}`);
  if (fm.metadata && Object.keys(fm.metadata).length) {
    lines.push('metadata:');
    for (const [k, v] of Object.entries(fm.metadata)) {
      lines.push(`  ${k}: ${yamlQuote(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function yamlQuote(s: string): string {
  if (/[:#\n\r]/.test(s) || s.includes('"')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** 生成 agentskills.io 兼容 SKILL.md 全文 */
export function toAgentSkillsSkillMd(skill: EvolvableSkill): string {
  const fm = toAgentSkillsFrontmatter(skill);
  const provenance = [
    '',
    '<!-- tripnara-skill-evolver: do not edit export copy; source under data/skill-evolver/ -->',
    '',
  ].join('\n');
  return `${serializeAgentSkillsYaml(fm)}\n${provenance}\n${skill.body.trim()}\n`;
}

export function validateAgentSkillsSkill(
  skill: EvolvableSkill,
  options?: { directoryName?: string },
): AgentSkillsValidationIssue[] {
  const issues: AgentSkillsValidationIssue[] = [];
  const fm = toAgentSkillsFrontmatter(skill);
  const dirName = options?.directoryName ?? fm.name;

  if (!isValidAgentSkillsName(fm.name)) {
    issues.push({
      severity: 'error',
      rule: 'name-format',
      message: `Invalid Agent Skills name "${fm.name}" (kebab-case, ≤64, no edge/consecutive hyphens)`,
    });
  }
  if (dirName !== fm.name) {
    issues.push({
      severity: 'error',
      rule: 'name-directory-match',
      message: `Directory "${dirName}" must match name "${fm.name}"`,
    });
  }
  if (!fm.description || fm.description.length < 1) {
    issues.push({ severity: 'error', rule: 'description-required', message: 'description is required' });
  }
  if (fm.description.length > 1024) {
    issues.push({
      severity: 'error',
      rule: 'description-length',
      message: `description length ${fm.description.length} > 1024`,
    });
  }

  const bodyLines = skill.body.split('\n').length;
  if (bodyLines > 500) {
    issues.push({
      severity: 'warning',
      rule: 'body-length',
      message: `SKILL.md body has ${bodyLines} lines; agentskills.io recommends <500 (use references/)`,
    });
  }

  const deepRef = /\]\([^)]+\/[^)]+\/[^)]+\)/;
  if (deepRef.test(skill.body)) {
    issues.push({
      severity: 'warning',
      rule: 'file-ref-depth',
      message: 'Markdown links may be nested >1 level; prefer references/ one level deep',
    });
  }

  return issues;
}

/** 解析 agentskills.io 导出 SKILL.md（用于校验导出产物） */
export function parseAgentSkillsSkillMd(raw: string, filePath: string): {
  name: string;
  description: string;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing frontmatter: ${filePath}`);
  const [, yaml, body] = match;
  let name = '';
  let description = '';
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(name|description):\s*(.+)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (m[1] === 'name') name = val;
    if (m[1] === 'description') description = val;
  }
  return { name, description, body: body.trim() };
}

export function validateExportedAgentSkillsFile(
  raw: string,
  filePath: string,
  directoryName: string,
): AgentSkillsValidationIssue[] {
  const parsed = parseAgentSkillsSkillMd(raw, filePath);
  const stub: EvolvableSkill = {
    skillId: parsed.name,
    name: parsed.description.split('.')[0] ?? parsed.name,
    version: 1,
    content: raw,
    body: parsed.body,
    frontmatter: { skill_id: parsed.name, name: parsed.name, version: 1 },
    tags: [],
    applicableScenarios: [],
    filePath,
    artifactType: 'markdown_skill',
  };
  const issues = validateAgentSkillsSkill(stub, { directoryName });
  if (parsed.name !== directoryName) {
    issues.push({
      severity: 'error',
      rule: 'export-dir-name',
      message: `Directory ${directoryName} != name ${parsed.name}`,
    });
  }
  if (!parsed.description) {
    issues.push({ severity: 'error', rule: 'description-required', message: 'exported description empty' });
  }
  return issues;
}
