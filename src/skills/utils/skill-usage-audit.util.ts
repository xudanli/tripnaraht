import * as fs from 'fs';
import * as path from 'path';

export type SkillUsageTier = 'CORE' | 'WORKBENCH' | 'REFERENCED' | 'DORMANT';
export type SkillUsageRecommendation =
  | 'KEEP'
  | 'WIRE_OR_DOCUMENT'
  | 'REVIEW'
  | 'CANDIDATE_DEPRECATE';

export interface SkillUsageAuditRow {
  name: string;
  tier: SkillUsageTier;
  recommendation: SkillUsageRecommendation;
  harnessPathLikely?: boolean;
}

export interface SkillUsageAuditPayload {
  generatedAt?: string;
  skills: SkillUsageAuditRow[];
}

const AUDIT_CANDIDATES = [
  path.join(process.cwd(), 'src/skills/generated/skill-usage-audit.json'),
  path.join(__dirname, '../generated/skill-usage-audit.json'),
];

/** Fallback when audit JSON missing (keep in sync with skill-deprecation-decisions.json). */
const FALLBACK_TOOL_SELECT_EXCLUDED = [
  'context.learn',
  'context.regressionTests',
  'iceland.alternativeValidator',
  'iceland.stormReroutingEngine',
  'world.adaptiveParameters',
  'world.collaborativeData',
  'world.failureRiskPrediction',
  'world.multimodalPerception',
  'world.realtimeWeather',
] as const;

const DEPRECATION_DECISIONS_CANDIDATES = [
  path.join(process.cwd(), 'src/skills/generated/skill-deprecation-decisions.json'),
  path.join(__dirname, '../generated/skill-deprecation-decisions.json'),
];

export interface SkillDeprecationDecisions {
  confirmedBy?: string;
  confirmedAt?: string;
  summary?: string;
  deprecated: string[];
  keep?: string[];
}

let cachedDeprecationDecisions: SkillDeprecationDecisions | null | undefined;

export function loadSkillDeprecationDecisions(): SkillDeprecationDecisions | null {
  if (cachedDeprecationDecisions !== undefined) {
    return cachedDeprecationDecisions;
  }
  for (const filePath of DEPRECATION_DECISIONS_CANDIDATES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkillDeprecationDecisions;
      if (Array.isArray(parsed.deprecated)) {
        cachedDeprecationDecisions = parsed;
        return cachedDeprecationDecisions;
      }
    } catch {
      // try next
    }
  }
  cachedDeprecationDecisions = null;
  return null;
}

export function isPmConfirmedDeprecated(name: string): boolean {
  const decisions = loadSkillDeprecationDecisions();
  return decisions?.deprecated.includes(name) ?? false;
}

export function getPmConfirmedDeprecatedSkillNames(): Set<string> {
  const decisions = loadSkillDeprecationDecisions();
  return new Set(decisions?.deprecated ?? []);
}

let cachedAudit: SkillUsageAuditPayload | null | undefined;

export function loadSkillUsageAudit(): SkillUsageAuditPayload | null {
  if (cachedAudit !== undefined) {
    return cachedAudit;
  }
  for (const filePath of AUDIT_CANDIDATES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkillUsageAuditPayload;
      if (Array.isArray(parsed.skills)) {
        cachedAudit = parsed;
        return cachedAudit;
      }
    } catch {
      // try next
    }
  }
  cachedAudit = null;
  return null;
}

export function buildSkillUsageMap(): Map<string, SkillUsageAuditRow> {
  const audit = loadSkillUsageAudit();
  const map = new Map<string, SkillUsageAuditRow>();
  for (const row of audit?.skills ?? []) {
    map.set(row.name, row);
  }
  return map;
}

export function getSkillUsageRow(name: string): SkillUsageAuditRow | undefined {
  return buildSkillUsageMap().get(name);
}

/** Default on; set TOOLS_SELECT_USAGE_MASK=0 to expose all registered skills to Tool RAG. */
export function isToolSelectUsageMaskEnabled(): boolean {
  const v = process.env.TOOLS_SELECT_USAGE_MASK;
  if (v === '0' || v === 'false') return false;
  return true;
}

export function getToolSelectExcludedSkillNames(): Set<string> {
  const excluded = new Set<string>(FALLBACK_TOOL_SELECT_EXCLUDED);
  for (const name of getPmConfirmedDeprecatedSkillNames()) {
    excluded.add(name);
  }
  const audit = loadSkillUsageAudit();
  if (audit) {
    for (const s of audit.skills) {
      if (s.recommendation === 'CANDIDATE_DEPRECATE') {
        excluded.add(s.name);
      }
    }
  }
  return excluded;
}

export function filterSkillsForToolSelect<T extends { metadata: { name: string } }>(
  skills: T[],
): T[] {
  if (!isToolSelectUsageMaskEnabled()) {
    return skills;
  }
  const excluded = getToolSelectExcludedSkillNames();
  if (excluded.size === 0) {
    return skills;
  }
  return skills.filter((s) => !excluded.has(s.metadata.name));
}
