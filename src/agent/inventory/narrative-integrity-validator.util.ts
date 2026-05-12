/**
 * Gen2 Narrative Integrity（最小实现）：确定性违禁短语 + 单次再生 + Runtime 降级附录。
 * 不做语义模型 / NLI / 多轮 judge。
 * @see docs/decision/ADR-WORLD-RUNTIME-V1-NAMING.md §8
 */

import { createHash } from 'crypto';
import { extractConsultationDashboardFromAnswer } from '../utils/consultation-dashboard-extract.util';
import type {
  NarrativeConsistencyRisk,
  NarrativeSafetyMode,
  NarrativeSafetyPayload,
} from './narrative-safety-evaluator.util';

export const NARRATIVE_INTEGRITY_VALIDATOR_VERSION = 1 as const;

/** Claim 分类：后续可替换为结构化抽取，第一版仅用于 audit / telemetry */
export type NarrativeClaimClass =
  | 'confirmed_inventory'
  | 'booking_guarantee'
  | 'availability_assertion'
  | 'freshness_assertion'
  | 'safe_to_execute'
  | 'tentative_language';

export type NarrativeIntegrityViolation = {
  claim: NarrativeClaimClass;
  severity: 'hard';
  matched_text: string;
  pattern_id: string;
};

export type NarrativeIntegrityEnforcementAction = 'pass' | 'regenerated' | 'downgraded';

export type NarrativeIntegrityReport = {
  validator_version: typeof NARRATIVE_INTEGRITY_VALIDATOR_VERSION;
  violations: NarrativeIntegrityViolation[];
  enforcement_action: NarrativeIntegrityEnforcementAction;
  regeneration_attempted?: boolean;
  /** 首轮校验命中（便于 replay / audit） */
  initial_violations?: NarrativeIntegrityViolation[];
  /** 单次再生耗时（毫秒），仅 regeneration_attempted 时有意义 */
  regenerate_duration_ms?: number;
};

/** 挂载到 `RouteAndRunResponseDto.observability`，与 payload 对账，便于 tracing / debug / eval */
export const NARRATIVE_INTEGRITY_OBSERVABILITY_SCHEMA = 'runtime/narrative-integrity/v1' as const;

export type NarrativeIntegrityObservabilitySlice = {
  schema: typeof NARRATIVE_INTEGRITY_OBSERVABILITY_SCHEMA;
  validator_version: typeof NARRATIVE_INTEGRITY_VALIDATOR_VERSION;
  narrative_safety_mode: NarrativeSafetyMode;
  consistency_risk: NarrativeConsistencyRisk;
  enforcement_action: NarrativeIntegrityEnforcementAction;
  regeneration_attempted?: boolean;
  regenerate_duration_ms?: number;
  violation_count: number;
  violation_pattern_ids?: string[];
  /** 聚合用：safety.reasons + pattern_id + enforcement */
  reason_codes: string[];
  integrity_summary_zh: string;
  /**
   * P2 Runtime Quality：由 `narrative_safety.mode` 映射 — safe=1，tentative=0.5，refresh_required=0。
   * 跨请求 mode 序列可由日志或 BI 推导 drift（本层不落 session state）。
   */
  narrative_integrity_score: number;
  /** violation `pattern_id` 排序后 SHA-256 前缀；空违规省略 */
  violation_pattern_fingerprint?: string;
};

function uniqStrings(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

/** P2：与 narrative_safety.mode 对齐的质量标量（用于聚合 / drift，而非业务 SLA） */
export function narrativeIntegrityScoreFromSafetyMode(mode: NarrativeSafetyMode): number {
  if (mode === 'safe') return 1;
  if (mode === 'tentative') return 0.5;
  return 0;
}

/** 跨 session 聚合违规形状：对 pattern_id 排序后取 sha256 十六进制前 16 位 */
export function fingerprintViolationPatternIds(patternIds: string[]): string | undefined {
  const sorted = [...new Set(patternIds.filter(Boolean))].sort();
  if (sorted.length === 0) return undefined;
  return createHash('sha256').update(sorted.join('|'), 'utf8').digest('hex').slice(0, 16);
}

export type NarrativeIntegrityMetricEvent = {
  tripnara_metric: 'narrative_integrity';
  metric_schema: 'narrative_integrity/v1';
  request_id: string;
  trip_id?: string;
  narrative_integrity_score: number;
  narrative_safety_mode: NarrativeSafetyMode;
  enforcement_action: NarrativeIntegrityEnforcementAction;
  violation_pattern_fingerprint?: string;
  violation_count: number;
  reason_codes: string[];
};

/** 单行 JSON 日志；需 `NARRATIVE_INTEGRITY_METRICS_LOG=1`。mode 时间序列供下游推导 safe→tentative→refresh 漂移 */
export function emitNarrativeIntegrityMetricEvent(params: {
  request_id: string;
  trip_id?: string;
  slice: NarrativeIntegrityObservabilitySlice;
}): void {
  if (process.env.NARRATIVE_INTEGRITY_METRICS_LOG !== '1') return;
  const ev: NarrativeIntegrityMetricEvent = {
    tripnara_metric: 'narrative_integrity',
    metric_schema: 'narrative_integrity/v1',
    request_id: params.request_id,
    ...(params.trip_id ? { trip_id: params.trip_id } : {}),
    narrative_integrity_score: params.slice.narrative_integrity_score,
    narrative_safety_mode: params.slice.narrative_safety_mode,
    enforcement_action: params.slice.enforcement_action,
    ...(params.slice.violation_pattern_fingerprint
      ? { violation_pattern_fingerprint: params.slice.violation_pattern_fingerprint }
      : {}),
    violation_count: params.slice.violation_count,
    reason_codes: params.slice.reason_codes,
  };
  console.log(JSON.stringify(ev));
}

/**
 * 供 observability / 日志 / 评测数据集挂接：`reason_codes` + 单行摘要。
 */
export function buildNarrativeIntegrityObservabilitySlice(
  safety: NarrativeSafetyPayload,
  report: NarrativeIntegrityReport,
): NarrativeIntegrityObservabilitySlice {
  const allPatternIds = report.violations.map((v) => v.pattern_id);
  const patternIds = allPatternIds.slice(0, 24);
  const fingerprint = fingerprintViolationPatternIds(allPatternIds);
  const narrative_integrity_score = narrativeIntegrityScoreFromSafetyMode(safety.mode);
  const reason_codes = uniqStrings([
    `enforcement:${report.enforcement_action}`,
    `narrative_safety:${safety.mode}`,
    ...safety.reasons.map((r) => `safety:${r}`),
    ...patternIds.map((p) => `pattern:${p}`),
  ]);

  let integrity_summary_zh: string;
  if (report.enforcement_action === 'pass') {
    integrity_summary_zh =
      safety.mode === 'safe'
        ? '叙事完整性：无需库存句式校验（narrative_safety=safe）。'
        : '叙事完整性：违禁短语校验通过。';
  } else if (report.enforcement_action === 'regenerated') {
    integrity_summary_zh =
      '叙事完整性：首轮命中违禁措辞，已单次重写并通过校验（Runtime Integrity regenerate）。';
  } else {
    integrity_summary_zh =
      '叙事完整性：重写后仍含违禁措辞或再生失败，已附加 Runtime 降级说明（downgrade）。';
  }

  return {
    schema: NARRATIVE_INTEGRITY_OBSERVABILITY_SCHEMA,
    validator_version: report.validator_version,
    narrative_safety_mode: safety.mode,
    consistency_risk: safety.consistency_risk,
    enforcement_action: report.enforcement_action,
    ...(report.regeneration_attempted ? { regeneration_attempted: true } : {}),
    ...(report.regenerate_duration_ms != null
      ? { regenerate_duration_ms: report.regenerate_duration_ms }
      : {}),
    violation_count: report.violations.length,
    ...(patternIds.length ? { violation_pattern_ids: patternIds } : {}),
    reason_codes,
    integrity_summary_zh,
    narrative_integrity_score,
    ...(fingerprint ? { violation_pattern_fingerprint: fingerprint } : {}),
  };
}

type PatternRow = {
  pattern_id: string;
  claim: NarrativeClaimClass;
  /** 不含 /g 时在扫描函数中加 */
  source: string;
};

const SHARED_PRICE_OR_FRESH: PatternRow[] = [
  {
    pattern_id: 'shared:当前最低价',
    claim: 'freshness_assertion',
    source: '当前最低价',
  },
];

const REFRESH_REQUIRED_PATTERNS: PatternRow[] = [
  { pattern_id: 'refresh:已确认', claim: 'booking_guarantee', source: '已确认' },
  { pattern_id: 'refresh:仍可订', claim: 'availability_assertion', source: '仍可订' },
  { pattern_id: 'refresh:仍可预订', claim: 'availability_assertion', source: '仍可预订' },
  { pattern_id: 'refresh:协调完成', claim: 'confirmed_inventory', source: '协调完成' },
  { pattern_id: 'refresh:已锁定', claim: 'booking_guarantee', source: '已锁定' },
  { pattern_id: 'refresh:保证有位', claim: 'booking_guarantee', source: '保证有位' },
  { pattern_id: 'refresh:一切就绪', claim: 'safe_to_execute', source: '一切就绪' },
  { pattern_id: 'refresh:舱位仍在', claim: 'availability_assertion', source: '舱位仍在' },
  { pattern_id: 'refresh:房源仍在', claim: 'availability_assertion', source: '房源仍在' },
  ...SHARED_PRICE_OR_FRESH,
];

const TENTATIVE_PATTERNS: PatternRow[] = [
  { pattern_id: 'tentative:保证', claim: 'tentative_language', source: '保证' },
  { pattern_id: 'tentative:确定可行', claim: 'tentative_language', source: '确定可行' },
  { pattern_id: 'tentative:绝无问题', claim: 'tentative_language', source: '绝无问题' },
  { pattern_id: 'tentative:肯定能订', claim: 'booking_guarantee', source: '肯定能订' },
  ...SHARED_PRICE_OR_FRESH,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectViolations(text: string, rows: PatternRow[]): NarrativeIntegrityViolation[] {
  const out: NarrativeIntegrityViolation[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const re = new RegExp(escapeRegExp(row.source), 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const key = `${row.pattern_id}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        claim: row.claim,
        severity: 'hard',
        matched_text: m[0],
        pattern_id: row.pattern_id,
      });
    }
  }
  return out;
}

function patternsForMode(mode: NarrativeSafetyMode): PatternRow[] {
  if (mode === 'refresh_required') {
    return REFRESH_REQUIRED_PATTERNS;
  }
  if (mode === 'tentative') {
    return TENTATIVE_PATTERNS;
  }
  return [];
}

/**
 * 在自然语言正文上扫描违禁短语（第一版：确定性子串 / 等价字面）。
 */
export function validateNarrativeAgainstSafety(
  userVisibleProse: string,
  safety: NarrativeSafetyPayload,
): { ok: boolean; violations: NarrativeIntegrityViolation[] } {
  if (safety.mode === 'safe') {
    return { ok: true, violations: [] };
  }
  const rows = patternsForMode(safety.mode);
  const violations = collectViolations(userVisibleProse, rows);
  return { ok: violations.length === 0, violations };
}

/** 与用户可见正文一致的校验输入：去掉 Consultation Dashboard 块，降低 JSON 误报 */
export function proseForNarrativeIntegrityCheck(fullAnswer: string): string {
  const { cleanText } = extractConsultationDashboardFromAnswer(fullAnswer.trim());
  return cleanText.trim();
}

export function buildRuntimeDowngradeAppendix(safety: NarrativeSafetyPayload): string {
  if (safety.mode === 'refresh_required') {
    return '⚠️ 部分库存信息已过期（航班/住宿），以下方案仅供参考，需刷新后才能确认可订性。';
  }
  if (safety.mode === 'tentative') {
    return '⚠️ 上文引用的实时报价与库存可能已变化，请以预订页或重新检索为准。';
  }
  return '';
}

/**
 * 将 Runtime 降级附录插入完整模型输出：若有 Dashboard / Suggested ops 标记，插在首个标记之前。
 */
export function appendRuntimeDowngradeToAnswer(fullAnswer: string, appendix: string): string {
  const a = appendix.trim();
  if (!a) return fullAnswer;
  const markers = ['<<<CONSULTATION_UI_JSON>>>', '<<<SUGGESTED_OPS_JSON>>>'] as const;
  let cut = -1;
  for (const m of markers) {
    const i = fullAnswer.indexOf(m);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut >= 0) {
    const head = fullAnswer.slice(0, cut).trimEnd();
    const tail = fullAnswer.slice(cut);
    return `${head}\n\n${a}\n\n${tail}`;
  }
  return `${fullAnswer.trimEnd()}\n\n${a}`;
}

function buildIntegrityRetryInstruction(violations: NarrativeIntegrityViolation[]): string {
  const samples = violations.map((v) => v.matched_text).slice(0, 8);
  return [
    '',
    '【Runtime Integrity — 必须重写】上一稿在用户可见正文中出现了叙事门控禁止的措辞（确定性库存/预订承诺或与当前 narrative_safety 等级不符）。',
    `命中示例（须避免）：${samples.join('、')}`,
    '请**全文重写**用户可见正文：严格遵守上文【叙事门控 · Narrative Gate】段落；禁止使用「已确认」「仍可订」「协调完成」「已锁定」「保证有位」「当前最低价」等与当前等级冲突的表述。',
    '若须引用上文 MCP/Amadeus 摘录，只能作为参考并提示以预订页为准。',
  ].join('\n');
}

export type NarrativeIntegrityPipelineParams = {
  answerText: string;
  safety: NarrativeSafetyPayload;
  /** 与首轮一致的完整编排 prompt（用于单次再生） */
  basePrompt: string;
  callLlm: (prompt: string) => Promise<string>;
};

function integrityDisabled(): boolean {
  return process.env.NARRATIVE_INTEGRITY_DISABLED === '1';
}

/**
 * validate →（违规且非 safe）单次 regenerate → 仍违规则 Runtime 降级附录。
 * 不对 LLM 无限重试。
 */
export async function enforceNarrativeIntegrityPipeline(
  params: NarrativeIntegrityPipelineParams,
): Promise<{ answerText: string; report: NarrativeIntegrityReport }> {
  const { safety, basePrompt, callLlm } = params;
  let answerText = params.answerText;

  const passReport = (action: NarrativeIntegrityEnforcementAction): NarrativeIntegrityReport => ({
    validator_version: NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
    violations: [],
    enforcement_action: action,
  });

  if (integrityDisabled() || safety.mode === 'safe') {
    return { answerText, report: passReport('pass') };
  }

  const prose = proseForNarrativeIntegrityCheck(answerText);
  const first = validateNarrativeAgainstSafety(prose, safety);
  if (first.ok) {
    return { answerText, report: passReport('pass') };
  }

  const initialViolations = first.violations;
  const regenStarted = Date.now();
  const retryPrompt = basePrompt + buildIntegrityRetryInstruction(initialViolations);
  let answerText2: string;
  try {
    answerText2 = await callLlm(retryPrompt);
  } catch {
    const appendix = buildRuntimeDowngradeAppendix(safety);
    answerText = appendix ? appendRuntimeDowngradeToAnswer(answerText, appendix) : answerText;
    return {
      answerText,
      report: {
        validator_version: NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
        violations: initialViolations,
        enforcement_action: 'downgraded',
        regeneration_attempted: true,
        initial_violations: initialViolations,
        regenerate_duration_ms: Date.now() - regenStarted,
      },
    };
  }

  const regenMs = Date.now() - regenStarted;
  const prose2 = proseForNarrativeIntegrityCheck(answerText2);
  const second = validateNarrativeAgainstSafety(prose2, safety);

  if (second.ok) {
    return {
      answerText: answerText2,
      report: {
        validator_version: NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
        violations: [],
        enforcement_action: 'regenerated',
        regeneration_attempted: true,
        initial_violations: initialViolations,
        regenerate_duration_ms: regenMs,
      },
    };
  }

  const appendix = buildRuntimeDowngradeAppendix(safety);
  const merged = appendix ? appendRuntimeDowngradeToAnswer(answerText2, appendix) : answerText2;

  return {
    answerText: merged,
    report: {
      validator_version: NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
      violations: second.violations,
      enforcement_action: 'downgraded',
      regeneration_attempted: true,
      initial_violations: initialViolations,
      regenerate_duration_ms: regenMs,
    },
  };
}
