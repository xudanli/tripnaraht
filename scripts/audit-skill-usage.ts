#!/usr/bin/env npx tsx
/**
 * Audit whether registered product Skills are actually wired into the codebase.
 *
 * Tiers (per skill, highest wins):
 *   CORE       — getSkill('name') or orchestration skillName (production src, excl. *.spec.ts)
 *   WORKBENCH  — direct DI in PlanningWorkbenchAgentService or similar orchestrators
 *   REFERENCED — quoted skill name outside own .skill.ts / generated/
 *   DORMANT    — only appears in manifest, registry, or own skill file
 *
 * Usage:
 *   npx tsx scripts/audit-skill-usage.ts
 *   npm run skills:audit-usage
 *   npm run skills:audit-usage -- --write-report --json
 */

import * as fs from 'fs';
import * as path from 'path';

const MANIFEST_FILE = path.join(process.cwd(), 'src/skills/generated/skills-manifest.json');
const DEFAULT_REPORT = path.join(process.cwd(), 'src/skills/generated/skill-usage-audit.json');

type UsageTier = 'CORE' | 'WORKBENCH' | 'REFERENCED' | 'DORMANT';
type Recommendation = 'KEEP' | 'WIRE_OR_DOCUMENT' | 'REVIEW' | 'CANDIDATE_DEPRECATE';

interface ManifestSkill {
  name: string;
  category: string;
  className: string;
  sourceFile: string;
  toolGroup?: string;
}

interface SkillUsageRow {
  name: string;
  category: string;
  className: string;
  sourceFile: string;
  tier: UsageTier;
  recommendation: Recommendation;
  hardGetSkill: boolean;
  orchestrationSkillName: boolean;
  workbenchInjected: boolean;
  referencedElsewhere: boolean;
  referenceFiles: string[];
  harnessPathLikely: boolean;
}

interface UsageReport {
  generatedAt: string;
  rubric: Record<string, string>;
  summary: {
    total: number;
    byTier: Record<UsageTier, number>;
    byRecommendation: Record<Recommendation, number>;
    byCategory: Record<string, { count: number; core: number; dormant: number }>;
  };
  skills: SkillUsageRow[];
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function rel(p: string): string {
  return path.relative(process.cwd(), p).replace(/\\/g, '/');
}

function isProductionSource(file: string): boolean {
  return !file.includes('.spec.') && !file.endsWith('.skill.ts');
}

function isHarnessExecutorPath(file: string): boolean {
  return (
    file.includes('/agent/execution/') ||
    file.includes('/agent/teams/research/') ||
    file.includes('/decision/kernel/decision-kernel.service.ts')
  );
}

/** 不计入 REFERENCED 的「自引用」文件（audit 工具、生成物、单测等） */
function isNoiseReferenceFile(file: string): boolean {
  return (
    file.startsWith('src/skills/generated/') ||
    file === 'scripts/audit-skill-usage.ts' ||
    file === 'src/skills/utils/skill-usage-audit.util.ts' ||
    file.includes('.spec.') ||
    file.includes('.harness.spec.')
  );
}

function buildWorkbenchClassSet(manifest: ManifestSkill[]): Set<string> {
  const workbenchFile = path.join(
    process.cwd(),
    'src/agent/services/planning-workbench-agent.service.ts',
  );
  if (!fs.existsSync(workbenchFile)) return new Set();
  const content = fs.readFileSync(workbenchFile, 'utf8');
  const classes = new Set<string>();
  for (const s of manifest) {
    if (content.includes(s.className)) classes.add(s.name);
  }
  return classes;
}

function recommend(row: Omit<SkillUsageRow, 'recommendation'>): Recommendation {
  if (row.tier === 'CORE' || row.tier === 'WORKBENCH') return 'KEEP';
  if (row.tier === 'REFERENCED') {
    if (row.category === 'rag' || row.name === 'tools.select' || row.name.startsWith('context.')) {
      return 'KEEP';
    }
    return 'WIRE_OR_DOCUMENT';
  }
  if (row.category === 'countryPack' || row.category === 'routeDirection') return 'REVIEW';
  if (row.name.startsWith('plan.') || row.name.startsWith('detail.') || row.name.startsWith('exec.')) {
    return 'WIRE_OR_DOCUMENT';
  }
  return 'CANDIDATE_DEPRECATE';
}

function audit(): UsageReport {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) as {
    skills: ManifestSkill[];
  };
  const skills = manifest.skills;

  const srcFiles = walk(path.join(process.cwd(), 'src'));
  const corpus = srcFiles.map((f) => ({ f, c: fs.readFileSync(f, 'utf8') }));

  const workbenchSet = buildWorkbenchClassSet(skills);

  const rows: SkillUsageRow[] = skills.map((skill) => {
    const esc = skill.name.replace(/\./g, '\\.');
    const getRe = new RegExp(`getSkill\\(\\s*['\"]${esc}['\"]`, 'g');
    const skillNameRe = new RegExp(`skillName\\s*:\\s*['\"]${esc}['\"]`, 'g');
    const quoteRe = new RegExp(`['"]${esc}['"]`, 'g');

    let hardGetSkill = false;
    let orchestrationSkillName = false;
    let referencedElsewhere = false;
    const referenceFiles: string[] = [];
    let harnessPathLikely = false;

    for (const { f, c } of corpus) {
      const r = rel(f);
      if (r === skill.sourceFile) continue;
      if (r.startsWith('src/skills/generated/')) continue;

      if (isProductionSource(r) && getRe.test(c)) {
        hardGetSkill = true;
        if (isHarnessExecutorPath(r)) harnessPathLikely = true;
        if (!referenceFiles.includes(r)) referenceFiles.push(r);
      }
      if (isProductionSource(r) && skillNameRe.test(c)) {
        orchestrationSkillName = true;
        if (!referenceFiles.includes(r)) referenceFiles.push(r);
      }
      if (quoteRe.test(c) && !isNoiseReferenceFile(r)) {
        referencedElsewhere = true;
        if (referenceFiles.length < 8 && !referenceFiles.includes(r)) referenceFiles.push(r);
      }
    }

    const workbenchInjected = workbenchSet.has(skill.name);

    let tier: UsageTier = 'DORMANT';
    if (hardGetSkill || orchestrationSkillName) tier = 'CORE';
    else if (workbenchInjected) tier = 'WORKBENCH';
    else if (referencedElsewhere) tier = 'REFERENCED';

    const base = {
      name: skill.name,
      category: skill.category,
      className: skill.className,
      sourceFile: skill.sourceFile,
      tier,
      hardGetSkill,
      orchestrationSkillName,
      workbenchInjected,
      referencedElsewhere,
      referenceFiles: referenceFiles.slice(0, 8),
      harnessPathLikely,
    };

    return { ...base, recommendation: recommend(base) };
  });

  const byTier: Record<UsageTier, number> = { CORE: 0, WORKBENCH: 0, REFERENCED: 0, DORMANT: 0 };
  const byRecommendation: Record<Recommendation, number> = {
    KEEP: 0,
    WIRE_OR_DOCUMENT: 0,
    REVIEW: 0,
    CANDIDATE_DEPRECATE: 0,
  };
  const byCategory: Record<string, { count: number; core: number; dormant: number }> = {};

  for (const row of rows) {
    byTier[row.tier]++;
    byRecommendation[row.recommendation]++;
    byCategory[row.category] ??= { count: 0, core: 0, dormant: 0 };
    byCategory[row.category].count++;
    if (row.tier === 'CORE' || row.tier === 'WORKBENCH') byCategory[row.category].core++;
    if (row.tier === 'DORMANT') byCategory[row.category].dormant++;
  }

  return {
    generatedAt: new Date().toISOString(),
    rubric: {
      CORE: 'getSkill 或 orchestration skillName 硬编码（生产代码）',
      WORKBENCH: 'Planning Workbench 等编排器直接注入调用',
      REFERENCED: '在其他文件中出现 skill 名字符串引用',
      DORMANT: '仅 manifest/registry/自身文件',
      KEEP: '已在主路径或 Tool RAG 上下文层，保留',
      WIRE_OR_DOCUMENT: '有产品意图但未接线，应接 API/编排或写清边界',
      REVIEW: 'Pack/配置类，确认是否仍被 context 链使用',
      CANDIDATE_DEPRECATE: '无引用且非核心域，可标记 experimental 或下线候选',
    },
    summary: {
      total: rows.length,
      byTier,
      byRecommendation,
      byCategory,
    },
    skills: rows.sort((a, b) => {
      const tierOrder: UsageTier[] = ['DORMANT', 'REFERENCED', 'WORKBENCH', 'CORE'];
      return tierOrder.indexOf(b.tier) - tierOrder.indexOf(a.tier) || a.name.localeCompare(b.name);
    }),
  };
}

function printReport(report: UsageReport): void {
  const { summary } = report;
  console.log(`\nSkill usage audit (${summary.total} skills)`);
  console.log(
    `Tiers: CORE=${summary.byTier.CORE} WORKBENCH=${summary.byTier.WORKBENCH} REFERENCED=${summary.byTier.REFERENCED} DORMANT=${summary.byTier.DORMANT}`,
  );
  console.log(
    `Recommendations: KEEP=${summary.byRecommendation.KEEP} WIRE=${summary.byRecommendation.WIRE_OR_DOCUMENT} REVIEW=${summary.byRecommendation.REVIEW} DEPRECATE?=${summary.byRecommendation.CANDIDATE_DEPRECATE}`,
  );

  const dormant = report.skills.filter((s) => s.tier === 'DORMANT');
  if (dormant.length) {
    console.log(`\nDORMANT (${dormant.length}):`);
    for (const s of dormant) console.log(`  - ${s.name} [${s.category}] → ${s.recommendation}`);
  }

  const wire = report.skills.filter((s) => s.recommendation === 'WIRE_OR_DOCUMENT');
  if (wire.length) {
    console.log(`\nWIRE_OR_DOCUMENT (${wire.length}):`);
    for (const s of wire.slice(0, 25)) console.log(`  - ${s.name} (${s.tier})`);
    if (wire.length > 25) console.log(`  ... +${wire.length - 25} more`);
  }
}

const writeReport = process.argv.includes('--write-report');
const asJson = process.argv.includes('--json');

const report = audit();

if (writeReport) {
  fs.mkdirSync(path.dirname(DEFAULT_REPORT), { recursive: true });
  fs.writeFileSync(DEFAULT_REPORT, JSON.stringify(report, null, 2));
  console.log(`Wrote report → ${rel(DEFAULT_REPORT)}`);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
