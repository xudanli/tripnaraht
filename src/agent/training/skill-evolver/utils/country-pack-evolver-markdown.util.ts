/**
 * 将 SkillEvolver 进化后的 country_pack Markdown 注入 Agent 上下文
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ContextBlock } from '../../../context-engine/types/context-package.types';

function skillEvolverBasePath(): string {
  return (
    process.env.SKILL_EVOLVER_BASE_PATH?.trim() ||
    path.join(process.cwd(), 'data/skill-evolver')
  );
}

export function shouldInjectSkillEvolverCountryPack(countryCode: string): boolean {
  const flag = process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK?.trim();
  if (!flag || flag === '0' || flag.toLowerCase() === 'false') return false;
  if (flag.toLowerCase() === 'true' || flag === '1') return true;
  return flag.toUpperCase() === countryCode.toUpperCase();
}

export function loadSkillEvolverCountryPackMarkdown(countryCode: string): string | null {
  const file = path.join(
    skillEvolverBasePath(),
    'artifacts/country-pack/current',
    `${countryCode.toUpperCase()}.md`,
  );
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  const body = raw.replace(/^---[\s\S]*?---\r?\n/, '').trim();
  return body || null;
}

function buildEvolverContextBlock(
  countryCode: string,
  body: string,
  source: 'filesystem' | 'readiness_pack',
  version?: string,
): ContextBlock {
  return {
    key: `SKILL_EVOLVER_COUNTRY_PACK_${countryCode.toUpperCase()}`,
    type: 'COUNTRY_SAFETY',
    text: `## SkillEvolver Country Pack（${countryCode}）\n\n${body.slice(0, 12000)}`,
    priority: 92,
    visibility: 'public',
    provenance: {
      source: 'computed',
      identifier: `skill-evolver:country_pack.${countryCode}`,
      version: version ?? 'current',
      timestamp: new Date().toISOString(),
    },
    data: { skillEvolver: true, countryCode: countryCode.toUpperCase(), source },
    dataSource: 'COMPUTED',
  };
}

/** ReadinessPack.packData.skillEvolver（由 sync 脚本写入） */
export function buildReadinessPackSkillEvolverContextBlock(
  countryCode: string,
  packData: unknown,
): ContextBlock | null {
  const ext = (packData as { skillEvolver?: { markdown?: string; syncedAt?: string } })
    ?.skillEvolver;
  const body = ext?.markdown?.trim();
  if (!body) return null;
  return buildEvolverContextBlock(
    countryCode,
    body,
    'readiness_pack',
    ext?.syncedAt ?? 'db',
  );
}

export function buildSkillEvolverCountryPackContextBlock(
  countryCode: string,
): ContextBlock | null {
  if (!shouldInjectSkillEvolverCountryPack(countryCode)) return null;
  const body = loadSkillEvolverCountryPackMarkdown(countryCode);
  if (!body) return null;
  return buildEvolverContextBlock(countryCode, body, 'filesystem');
}

/** 生产：DB 同步块；开发：SKILL_EVOLVER_INJECT 文件覆盖 */
export function resolveSkillEvolverCountryPackBlock(
  countryCode: string,
  packData?: unknown,
): ContextBlock | null {
  return (
    buildSkillEvolverCountryPackContextBlock(countryCode) ??
    (packData ? buildReadinessPackSkillEvolverContextBlock(countryCode, packData) : null)
  );
}
