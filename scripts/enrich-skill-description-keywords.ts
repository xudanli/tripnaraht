#!/usr/bin/env npx tsx
/**
 * Prefix skill.name (or custom copy) into metadata.description for Tool RAG keyword overlap.
 * Targets skills flagged WEAK_KEYWORDS in the audit report, plus known B-grade outliers.
 *
 * Usage:
 *   npx tsx scripts/enrich-skill-description-keywords.ts
 *   npm run skills:enrich-keywords
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILLS_ROOT = path.join(process.cwd(), 'src/skills');
const AUDIT_FILE = path.join(SKILLS_ROOT, 'generated/skill-description-audit.json');

/** Full replacement when prefix-only is insufficient (B-grade / missing when+what). */
const OVERRIDES: Record<string, string> = {
  'worldState.summarize':
    'worldState.summarize：汇总 physical 世界为 OperationalWorldState（冰岛 tripId 走 IcelandOperationalDomainPipeline + WorldOperationalArbitration）。在 planning/decision 阶段 policy.resolve/readiness 前需 OS 世界状态时调用。',
  'decision.replay':
    'decision.replay：E2E 回放 decision logs+inputs 并 diff 期望输出。在评测/CI 回归或调试 orchestration 决策链时调用。',
  'decision.logAppend':
    'decision.logAppend：追加三人格 decision 日志到可检索事件流。在 runThreeGuardians 或 gate 每次产生结构化决策后需审计留痕时调用。',
  'detail.explainDecision':
    'detail.explainDecision：基于 decision log 生成面向用户的决策解释。在用户查看行程详情页或追问「为什么这样安排」时调用。',
  'detail.showEvidence':
    'detail.showEvidence：展示 decision evidence 引用与依据摘要。在用户需要验证结论来源或 detail 页展示证据链时调用。',
  'geo.findNearbyPOI':
    'geo.findNearbyPOI：按类型/半径/过滤查找附近 POI（PostGIS 安全出口）。在 RESEARCH 阶段补全周边景点或 repair 需空间候选召回时调用。',
  'geo.sampleElevationProfile':
    'geo.sampleElevationProfile：基于 PostGIS/DEM 采样路线海拔剖面（爬升/坡度/疲劳）。在 verify/pace 评估需高程 profile 且已有 polyline 时调用。',
  'plan.pace.adjustSchedule':
    'plan.pace.adjustSchedule：根据用户反馈 adjust plan 节奏（太累/太赶），不破坏主线。在用户反馈 pace 过载/过赶且已有 planState 时调用。',
  'world.collaborativeData':
    'world.collaborativeData：获取协作 world 模型数据（用户贡献、专家验证）。在 world.buildContext 需补充众包/专家字段时调用。',
};

function walkSkillFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSkillFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.skill.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function extractBracedBlock(content: string, marker: string): string | null {
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = content.indexOf('{', idx + marker.length - 1);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(braceStart + 1, i);
    }
  }
  return null;
}

function extractQuotedField(block: string, field: string): string | undefined {
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`);
  return block.match(re)?.[2]?.trim();
}

function parseSkillName(content: string): string | undefined {
  const metaInner =
    extractBracedBlock(content, 'metadata = {') ??
    extractBracedBlock(content, 'metadata= {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata= {');
  return metaInner ? extractQuotedField(metaInner, 'name') : undefined;
}

function nameTokens(name: string): string[] {
  return name
    .split(/[._]/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !['skill', 'get', 'the', 'and', 'for'].includes(t));
}

function hasKeywordOverlap(name: string, description: string): boolean {
  const desc = description.toLowerCase();
  const tokens = nameTokens(name);
  if (tokens.length === 0) return desc.length >= 20;
  const hits = tokens.filter((t) => desc.includes(t));
  return hits.length >= Math.min(2, tokens.length) || hits.length / tokens.length >= 0.34;
}

function enrichDescription(name: string, desc: string): string {
  if (OVERRIDES[name]) return OVERRIDES[name];
  const key = name.toLowerCase();
  if (desc.toLowerCase().includes(key) && hasKeywordOverlap(name, desc)) {
    return desc;
  }
  if (desc.startsWith(`${name}：`) || desc.startsWith(`${name}:`)) {
    return desc;
  }
  return `${name}：${desc}`;
}

function replaceDescriptionInContent(content: string, oldDesc: string, newDesc: string): string {
  if (oldDesc === newDesc) return content;
  const markers = [
    'metadata = {',
    'metadata= {',
    'metadata: SkillMetadata = {',
    'metadata: SkillMetadata= {',
  ];
  for (const marker of markers) {
    const start = content.indexOf(marker);
    if (start === -1) continue;
    const blockStart = content.indexOf('{', start);
    if (blockStart === -1) continue;
    let depth = 0;
    let blockEnd = -1;
    for (let i = blockStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd === -1) continue;
    const block = content.slice(blockStart, blockEnd + 1);
    const descRe = /description\s*:\s*(['"`])([\s\S]*?)\1/;
    if (!descRe.test(block)) continue;
    const newBlock = block.replace(descRe, `description: '${newDesc.replace(/'/g, "\\'")}'`);
    if (newBlock !== block) {
      return content.slice(0, blockStart) + newBlock + content.slice(blockEnd + 1);
    }
  }
  return content;
}

function loadTargetNames(): Set<string> {
  const targets = new Set<string>(Object.keys(OVERRIDES));
  if (fs.existsSync(AUDIT_FILE)) {
    const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) as {
      skills: Array<{ name: string; issues: Array<{ code: string }> }>;
    };
    for (const row of audit.skills) {
      if (row.issues.some((i) => i.code === 'WEAK_KEYWORDS')) {
        targets.add(row.name);
      }
    }
  }
  return targets;
}

function main(): void {
  const targets = loadTargetNames();
  let updated = 0;
  let skipped = 0;

  for (const file of walkSkillFiles(SKILLS_ROOT)) {
    const content = fs.readFileSync(file, 'utf8');
    const name = parseSkillName(content);
    if (!name || !targets.has(name)) continue;

    const metaInner =
      extractBracedBlock(content, 'metadata = {') ??
      extractBracedBlock(content, 'metadata= {') ??
      extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
      extractBracedBlock(content, 'metadata: SkillMetadata= {');
    const oldDesc = metaInner ? extractQuotedField(metaInner, 'description') : undefined;
    if (!oldDesc) {
      skipped++;
      continue;
    }

    const newDesc = enrichDescription(name, oldDesc);
    if (newDesc === oldDesc) {
      skipped++;
      continue;
    }

    const next = replaceDescriptionInContent(content, oldDesc, newDesc);
    if (next === content) {
      console.warn(`skip (replace failed): ${name}`);
      skipped++;
      continue;
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log(`enriched ${name}`);
    updated++;
  }

  console.log(`\nDone: ${updated} enriched, ${skipped} skipped (${targets.size} targets)`);
}

main();
