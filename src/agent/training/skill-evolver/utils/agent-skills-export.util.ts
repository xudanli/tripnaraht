import * as fs from 'fs';
import * as path from 'path';
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';
import { parseSkillMarkdown } from './markdown-skill.util';
import {
  skillIdToAgentSkillsName,
  toAgentSkillsSkillMd,
  validateAgentSkillsSkill,
  type AgentSkillsExportRecord,
  type AgentSkillsValidationIssue,
} from './agent-skills-compat.util';

const BUNDLE_SUBDIRS = ['scripts', 'references', 'assets'] as const;

export interface ExportAgentSkillsOptions {
  basePath: string;
  exportRoot?: string;
  skillIds?: string[];
}

export interface ExportAgentSkillsResult {
  exportRoot: string;
  records: AgentSkillsExportRecord[];
  issues: AgentSkillsValidationIssue[];
}

function copyDirIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function loadSkillFromRegistry(basePath: string, skillId: string): EvolvableSkill {
  const registry = JSON.parse(
    fs.readFileSync(path.join(basePath, 'skill_registry.json'), 'utf-8'),
  ) as { skills: Record<string, { artifactType?: string; countryCode?: string }> };
  const entry = registry.skills[skillId];
  if (!entry) throw new Error(`skill not in registry: ${skillId}`);

  const type = entry.artifactType ?? 'markdown_skill';
  let filePath: string;
  if (type === 'country_pack') {
    const cc = entry.countryCode ?? skillId.replace(/^country_pack\./, '');
    filePath = path.join(basePath, 'artifacts', 'country-pack', 'current', `${cc}.md`);
  } else {
    filePath = path.join(basePath, 'current', `${skillId}.md`);
  }
  return parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), filePath);
}

export function exportSkillsToAgentSkillsFormat(
  options: ExportAgentSkillsOptions,
): ExportAgentSkillsResult {
  const basePath = options.basePath;
  const exportRoot = options.exportRoot ?? path.join(basePath, 'agent-skills-export');
  const registry = JSON.parse(
    fs.readFileSync(path.join(basePath, 'skill_registry.json'), 'utf-8'),
  ) as { skills: Record<string, unknown> };
  const skillIds = options.skillIds ?? Object.keys(registry.skills);

  if (!fs.existsSync(exportRoot)) fs.mkdirSync(exportRoot, { recursive: true });

  const records: AgentSkillsExportRecord[] = [];
  const issues: AgentSkillsValidationIssue[] = [];

  for (const skillId of skillIds) {
    const skill = loadSkillFromRegistry(basePath, skillId);
    const agentSkillsName = skillIdToAgentSkillsName(skill.skillId);
    const skillDir = path.join(exportRoot, agentSkillsName);
    if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

    const skillMd = toAgentSkillsSkillMd(skill);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

    const bundleRoot = path.join(basePath, 'bundles', skill.skillId);
    for (const sub of BUNDLE_SUBDIRS) {
      copyDirIfExists(path.join(bundleRoot, sub), path.join(skillDir, sub));
    }

    issues.push(...validateAgentSkillsSkill(skill, { directoryName: agentSkillsName }));

    records.push({
      tripnaraSkillId: skill.skillId,
      agentSkillsName,
      exportDir: skillDir,
      skillMdPath: path.join(skillDir, 'SKILL.md'),
    });
  }

  fs.writeFileSync(
    path.join(exportRoot, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        spec: 'https://agentskills.io/specification.md',
        skills: records,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { exportRoot, records, issues };
}

export function validateAllRegisteredSkills(basePath: string): {
  skillId: string;
  issues: AgentSkillsValidationIssue[];
}[] {
  const registry = JSON.parse(
    fs.readFileSync(path.join(basePath, 'skill_registry.json'), 'utf-8'),
  ) as { skills: Record<string, unknown> };
  return Object.keys(registry.skills).map((skillId) => {
    const skill = loadSkillFromRegistry(basePath, skillId);
    const name = skillIdToAgentSkillsName(skill.skillId);
    return { skillId, issues: validateAgentSkillsSkill(skill, { directoryName: name }) };
  });
}
