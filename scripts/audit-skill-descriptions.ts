#!/usr/bin/env npx tsx
/**
 * Audit product Skill metadata.description for Tool RAG / agentskills-style quality.
 *
 * Heuristic: good descriptions state WHAT the skill does and WHEN to use it,
 * with domain keywords that help tools.select embedding + keyword prefilter.
 *
 * Usage:
 *   npx tsx scripts/audit-skill-descriptions.ts
 *   npm run skills:audit-descriptions
 *   npm run skills:audit-descriptions -- --json
 *   npm run skills:audit-descriptions -- --fail-on C --write-report
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILLS_ROOT = path.join(process.cwd(), 'src/skills');
const MANIFEST_FILE = path.join(SKILLS_ROOT, 'generated/skills-manifest.json');
const DEFAULT_REPORT = path.join(SKILLS_ROOT, 'generated/skill-description-audit.json');

interface ManifestSkill {
  name: string;
  category: string;
  description: string;
  sourceFile: string;
  toolGroup?: string;
}

interface AuditIssue {
  code: string;
  message: string;
}

interface SkillAuditRow {
  name: string;
  category: string;
  sourceFile: string;
  toolGroup?: string;
  description: string;
  charCount: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  hasWhat: boolean;
  hasWhen: boolean;
  hasKeywords: boolean;
  issues: AuditIssue[];
  suggestion?: string;
}

interface AuditReport {
  generatedAt: string;
  rubric: {
    what: string;
    when: string;
    keywords: string;
    grades: Record<string, string>;
  };
  summary: {
    total: number;
    averageScore: number;
    byGrade: Record<string, number>;
    byCategory: Record<string, { count: number; averageScore: number }>;
    issueCounts: Record<string, number>;
  };
  skills: SkillAuditRow[];
}

const WHAT_VERBS =
  /(?:生成|验证|搜索|检查|构建|应用|获取|列出|融合|压缩|预测|分析|计算|检测|修复|调整|写入|读取|浏览|选择|评估|学习|创建|更新|拉取|解析|执行|编排|回放|请求|解决|展示|解释|理解|处理|排序|建议|裁决|映射|识别|推荐|注册|合并|裁剪|注入|审计|过滤|对比|提交|查找|查询|compile|generate|verify|search|check|build|apply|get|list|merge|compress|predict|analyze|compute|detect|repair|adjust|write|read|browse|select|evaluate|create|update|fetch|parse|execute|replay|request|resolve|show|explain|handle|rank|suggest|validate|assess|plan|classify|filter|compare|find|query|resolve|summarize|extract|transform|route|rerank|block|allow|reject|approve)/i;

const WHEN_PATTERNS =
  /(?:当|用于|适合|需要|推荐|调用|阶段|用户|规划|验证|修复|调整|改行程|一键|输入|输出|缺少|无法|之前|之后|期间|场景|Use when|when the|when user|when a|if the|if user|before |after |during |for |in planning|in repair|on |at |根据|按|在.*?时|trip|request|query|phase|agent|blocker|gate|readiness|itinerary|冰岛|iceland|budget|pace|transit|approval|human-in-the-loop|HITL|OS:|Tool RAG|Context|Neptune|Abu|Dr\.?Dre|三人格|Guardian|corridor|segment|F-road|高地|租车|签证|行前|执行门控|world model|operational)/i;

const TRUNCATED_END = /(?:给|给出|为|用于|当|在|和|或|的|与|及)$/;

function walkSkillFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.skill.ts') && !entry.name.endsWith('.spec.ts')) {
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
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(braceStart + 1, i);
      }
    }
  }
  return null;
}

function extractQuotedField(block: string, field: string): string | undefined {
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`);
  const m = block.match(re);
  return m?.[2]?.trim();
}

function parseSkillFile(absPath: string): ManifestSkill | null {
  const content = fs.readFileSync(absPath, 'utf8');
  const metaInner =
    extractBracedBlock(content, 'metadata = {') ??
    extractBracedBlock(content, 'metadata= {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata= {');
  if (!metaInner) return null;

  const name = extractQuotedField(metaInner, 'name');
  const category = extractQuotedField(metaInner, 'category');
  if (!name || !category) return null;

  return {
    name,
    category,
    description: extractQuotedField(metaInner, 'description') ?? '',
    sourceFile: path.relative(process.cwd(), absPath).split(path.sep).join('/'),
    ...(extractQuotedField(metaInner, 'toolGroup')
      ? { toolGroup: extractQuotedField(metaInner, 'toolGroup') }
      : {}),
  };
}

function loadSkills(): ManifestSkill[] {
  const files = walkSkillFiles(SKILLS_ROOT).sort();
  const byName = new Map<string, ManifestSkill>();
  for (const file of files) {
    const row = parseSkillFile(file);
    if (row) byName.set(row.name, row);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
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

function scoreToGrade(score: number): SkillAuditRow['grade'] {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function buildSuggestion(row: Pick<SkillAuditRow, 'name' | 'category' | 'issues'>): string | undefined {
  const codes = new Set(row.issues.map((i) => i.code));
  const nameHint = row.name.replace(/\./g, ' ');
  if (codes.has('EMPTY') || codes.has('TOO_SHORT') || codes.has('TRUNCATED')) {
    return `补全描述：说明「${nameHint}」做什么 + 在什么规划阶段/用户意图下调用。`;
  }
  if (codes.has('MISSING_WHEN')) {
    return `在 description 末尾补充触发场景，例如：「在 ${row.category} 阶段 / 当用户… / 输入含 tripId 时」。`;
  }
  if (codes.has('MISSING_WHAT')) {
    return `开头用动词明确能力，例如：「生成/验证/搜索/融合…」，并列出主要输入输出。`;
  }
  if (codes.has('WEAK_KEYWORDS')) {
    return `加入 skill 名中的域词（${nameTokens(row.name).slice(0, 4).join(', ')}）便于 Tool RAG 向量匹配。`;
  }
  if (codes.has('ENGLISH_ONLY_NO_WHEN')) {
    return `英文描述请加 "Use when …" 触发条件，或改为中英双语便于中文 query 召回。`;
  }
  return undefined;
}

function auditSkill(skill: ManifestSkill): SkillAuditRow {
  const description = (skill.description ?? '').trim();
  const issues: AuditIssue[] = [];
  let score = 0;

  if (!description) {
    issues.push({ code: 'EMPTY', message: 'description 为空' });
  } else if (description.length < 12) {
    issues.push({ code: 'TOO_SHORT', message: `过短（${description.length} 字符）` });
  } else if (TRUNCATED_END.test(description)) {
    issues.push({ code: 'TRUNCATED', message: '描述疑似被截断（以不完整词结尾）' });
  }

  const hasWhat = WHAT_VERBS.test(description);
  const hasWhen = WHEN_PATTERNS.test(description);
  const hasKeywords = hasKeywordOverlap(skill.name, description);

  // WHAT (0–40)
  if (hasWhat && description.length >= 20) score += 40;
  else if (hasWhat) score += 28;
  else if (description.length >= 15) score += 12;
  else score += 0;
  if (!hasWhat) {
    issues.push({ code: 'MISSING_WHAT', message: '缺少清晰的能力动词（做什么）' });
  }

  // WHEN (0–40)
  if (hasWhen && description.length >= 24) score += 40;
  else if (hasWhen) score += 30;
  else if (/[:：]/.test(description) && description.length >= 18) score += 18;
  else score += 0;
  if (!hasWhen) {
    issues.push({ code: 'MISSING_WHEN', message: '缺少使用场景/触发条件（什么时候用）' });
  }

  // Keywords (0–20)
  if (hasKeywords) score += 20;
  else {
    score += description.length >= 40 ? 8 : 0;
    issues.push({ code: 'WEAK_KEYWORDS', message: '与 skill 名域词重叠不足，不利于 Tool RAG 召回' });
  }

  const mostlyEnglish = /^[\x00-\x7F\s.,;:!?'"()\-+/[\]{}]+$/.test(description);
  if (mostlyEnglish && !hasWhen) {
    issues.push({
      code: 'ENGLISH_ONLY_NO_WHEN',
      message: '纯英文描述且无 when 触发语，中文 query 与 phase 规则难匹配',
    });
    score = Math.max(0, score - 8);
  }

  if (issues.some((i) => ['EMPTY', 'TOO_SHORT', 'TRUNCATED'].includes(i.code))) {
    score = Math.min(score, 25);
  }

  score = Math.max(0, Math.min(100, score));

  const row: SkillAuditRow = {
    name: skill.name,
    category: skill.category,
    sourceFile: skill.sourceFile,
    toolGroup: skill.toolGroup,
    description,
    charCount: description.length,
    score,
    grade: scoreToGrade(score),
    hasWhat,
    hasWhen,
    hasKeywords,
    issues,
  };
  row.suggestion = buildSuggestion(row);
  return row;
}

function buildReport(skills: SkillAuditRow[]): AuditReport {
  const byGrade: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const byCategory: Record<string, { count: number; averageScore: number }> = {};
  const issueCounts: Record<string, number> = {};

  for (const s of skills) {
    byGrade[s.grade] = (byGrade[s.grade] ?? 0) + 1;
    if (!byCategory[s.category]) byCategory[s.category] = { count: 0, averageScore: 0 };
    byCategory[s.category].count += 1;
    byCategory[s.category].averageScore += s.score;
    for (const issue of s.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].averageScore = Math.round(
      byCategory[cat].averageScore / byCategory[cat].count,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    rubric: {
      what: '是否用动词/能力短语说明做什么（tools.select 向量文本的一部分）',
      when: '是否说明阶段、输入、用户意图或触发条件（agentskills description 最佳实践）',
      keywords: 'description 是否与 skill.name 域词有足够重叠',
      grades: { A: '>=80', B: '65-79', C: '50-64', D: '35-49', F: '<35' },
    },
    summary: {
      total: skills.length,
      averageScore: skills.length
        ? Math.round(skills.reduce((a, s) => a + s.score, 0) / skills.length)
        : 0,
      byGrade,
      byCategory,
      issueCounts,
    },
    skills,
  };
}

function printConsoleReport(report: AuditReport, minGrade?: string): void {
  const gradeOrder = ['F', 'D', 'C', 'B', 'A'];
  const minIdx = minGrade ? gradeOrder.indexOf(minGrade) : 0;
  const filtered = report.skills.filter((s) => gradeOrder.indexOf(s.grade) <= minIdx);

  console.log(`\nSkill description audit (${report.summary.total} skills)`);
  console.log(`Average score: ${report.summary.averageScore}/100`);
  console.log(
    `Grades: A=${report.summary.byGrade.A} B=${report.summary.byGrade.B} C=${report.summary.byGrade.C} D=${report.summary.byGrade.D} F=${report.summary.byGrade.F}`,
  );
  console.log('\nTop issues:');
  for (const [code, count] of Object.entries(report.summary.issueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${count}`);
  }
  console.log('\nBy category (avg score):');
  for (const [cat, stat] of Object.entries(report.summary.byCategory).sort(
    (a, b) => a[1].averageScore - b[1].averageScore,
  )) {
    console.log(`  ${cat}: ${stat.averageScore} (${stat.count})`);
  }

  const worst = [...filtered].sort((a, b) => a.score - b.score);
  console.log(`\nLowest scores${minGrade ? ` (grade <= ${minGrade})` : ''}:`);
  for (const s of worst.slice(0, 25)) {
    const flags = [
      s.hasWhat ? 'what' : '-',
      s.hasWhen ? 'when' : '-',
      s.hasKeywords ? 'kw' : '-',
    ].join(',');
    console.log(`  [${s.grade} ${s.score}] ${s.name} (${flags})`);
    console.log(`    ${s.description.slice(0, 120)}${s.description.length > 120 ? '…' : ''}`);
    if (s.suggestion) console.log(`    → ${s.suggestion}`);
  }
  if (worst.length > 25) {
    console.log(`  … and ${worst.length - 25} more (see JSON report)`);
  }
}

function parseArgs(argv: string[]) {
  return {
    json: argv.includes('--json'),
    writeReport: argv.includes('--write-report'),
    reportPath: argv.find((a) => a.startsWith('--report='))?.slice('--report='.length) ?? DEFAULT_REPORT,
    failOn: argv.find((a) => a.startsWith('--fail-on='))?.slice('--fail-on='.length)?.toUpperCase(),
    minGrade: argv.find((a) => a.startsWith('--min-grade='))?.slice('--min-grade='.length)?.toUpperCase(),
  };
}

function gradeMeetsThreshold(grade: string, failOn: string): boolean {
  const order = ['A', 'B', 'C', 'D', 'F'];
  return order.indexOf(grade) <= order.indexOf(failOn);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const skills = loadSkills();
  const audited = skills.map(auditSkill);
  const report = buildReport(audited);

  if (args.writeReport) {
    fs.mkdirSync(path.dirname(args.reportPath), { recursive: true });
    fs.writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Wrote report → ${path.relative(process.cwd(), args.reportPath)}`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printConsoleReport(report, args.minGrade);
  }

  if (args.failOn) {
    const bad = report.skills.filter((s) => !gradeMeetsThreshold(s.grade, args.failOn!));
    if (bad.length > 0) {
      console.error(
        `\nFAIL: ${bad.length} skill(s) below grade ${args.failOn} threshold (--fail-on=${args.failOn})`,
      );
      process.exit(1);
    }
  }
}

main();
