/**
 * 可执行性 / VERIFY 等面向最终用户的文案收束（剥离 L3 机读前缀、英文化码）。
 * 审计与回放仍可在 decision_log / 原始 violations 中取全量字段。
 */

import { parseL3ProofPrefix } from './narrator-l3-persuasion.util';
import {
  dedupeRepeatedClarificationParagraphs,
  scrubInternalAgentLeakage,
} from './structured-intake-clarification.util';
import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import { parseClarificationQuestionsForClient } from '../validation/clarification-question.schema';
import type { DecisionLogEntry, GateResult, Itinerary } from '../interfaces/trip-plan.interface';
import { attachClarificationMarkdownHtml } from './user-clarification-markdown.util';
import { deriveGuardianPersonaVotes } from './guardian-persona-surface.util';
import { filterGateViolationsAgainstItinerary } from './filter-stale-verify-violations.util';
import { formatDecisionLogInputsDisplayZh, formatDecisionLogOutputsDisplayZh } from './decision-log-user-facing.zh.util';

const VERIFY_CODE_LABEL_ZH: Record<string, string> = {
  ROUTE_INFEASIBLE: '路线与当前车型或路况条件不匹配（可能含高地 / F 路等限制路段）',
  TERRAIN_F_ROAD_UNFIT: '行程含 F 路或高地路段，与当前所选车型不匹配',
  POI_CLOSED: '景点开放时间或营业数据待核实',
  OPENING_HOURS_CONFLICT: '与景点开放时间或可达时段存在冲突',
  TRANSFER_BUFFER: '转乘或衔接时间偏紧，存在误点风险',
  TIME_SPACE_MIN_TRANSFER_BUFFER: '转乘缓冲不足，存在衔接风险',
};

const VERIFY_CLASS_LABEL_ZH: Record<string, string> = {
  ADVISORY: '提示',
  CONFLICT: '冲突',
  FATAL: '严重问题',
};

/** Kernel VERIFY issue.code → 短中文标签（未知码原样返回，便于排障） */
export function humanizeVerifyConflictCode(code: string): string {
  const c = String(code ?? '').trim();
  if (!c) return '';
  return VERIFY_CODE_LABEL_ZH[c] ?? c;
}

/** 多条 VERIFY 冲突码 → 顿号分隔的中文说明 */
export function humanizeVerifyConflictCodesZh(codes: string[]): string {
  if (!codes?.length) return '';
  return codes.map(humanizeVerifyConflictCode).filter(Boolean).join('、');
}

/**
 * 去掉开头的 `[L3-PROOF|…]` 机读块（可连续多块），保留其后给人看的句子。
 */
export function stripLeadingL3ProofBlocks(message: string): string {
  let s = String(message ?? '').trim();
  for (let i = 0; i < 5; i++) {
    if (!parseL3ProofPrefix(s)) break;
    const end = s.indexOf(']');
    if (end <= 0) break;
    s = s.slice(end + 1).trim();
  }
  return s.trim();
}

/** merge-verify 写入的 detail：`[VERIFY] CODE` + 可选 ` [entity:…]` + `: ` + 正文（正文前可带 L3） */
const VERIFY_MERGED_HEAD =
  /^\[VERIFY\]\s+([A-Z0-9_]+)(?:\s+\[entity:[^\]]+\])?\s*:\s*/i;

/** 内部审计用标签，不向最终用户展示 */
const LEADING_AUDIT_BRACKET = /^【[^】]{1,120}】\s*/;

/**
 * 去掉 verify / 仲裁技能加在句首的「【…】」标签（可连续多个）。
 */
export function stripLeadingAuditBracketTags(message: string): string {
  let s = String(message ?? '').trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(LEADING_AUDIT_BRACKET, '').trim();
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/**
 * UI 标题：用中文说明代替 `可执行性 · ROUTE_INFEASIBLE` / `ADVISORY · POI_CLOSED` 等英码。
 */
export function humanizeVerifyIssueHeadlineZh(code: string | undefined, issueClass?: string): string {
  const c = String(code ?? '').trim();
  const cls = String(issueClass ?? '').toUpperCase();
  const section = VERIFY_CLASS_LABEL_ZH[cls] ?? '可执行性';
  if (!c) return `${section}提示`;
  const body = humanizeVerifyConflictCode(c);
  return `${section}：${body}`;
}

export function humanizeVerifyIssueClassLabelZh(issueClass: string | undefined): string | undefined {
  const cls = String(issueClass ?? '').toUpperCase();
  return VERIFY_CLASS_LABEL_ZH[cls];
}

/**
 * Kernel VERIFY `metadata.issues[]` 单条 → 用户可见副本（决策面板 / ADVISORY 折叠区）。
 */
export function sanitizeVerificationIssueForClientDisplay(
  issue: Record<string, unknown>,
): Record<string, unknown> {
  const code = typeof issue.code === 'string' ? issue.code : '';
  const issueClass = typeof issue.class === 'string' ? issue.class : '';
  const rawMsg = typeof issue.message === 'string' ? issue.message : '';
  const message = surfaceRawVerifyIssueMessageForUserZh(rawMsg);
  const classLabel = humanizeVerifyIssueClassLabelZh(issueClass);
  const codeLabel = code ? humanizeVerifyConflictCode(code) : undefined;
  return {
    ...issue,
    message,
    display_message_zh: message,
    ...(codeLabel ? { code_label_zh: codeLabel } : {}),
    ...(classLabel ? { class_label_zh: classLabel } : {}),
    ...(code ? { headline_zh: humanizeVerifyIssueHeadlineZh(code, issueClass) } : {}),
  };
}

/**
 * BFF 出站：决策日志中 VERIFY 步骤的 `metadata.issues` 用户可见副本。
 */
export function sanitizeDecisionLogForClientDisplay(log: DecisionLogEntry[]): DecisionLogEntry[] {
  return log.map((entry) => {
    const inputsDisplay = formatDecisionLogInputsDisplayZh(entry);
    const outputsDisplay = formatDecisionLogOutputsDisplayZh(entry);
    let withDisplay = entry;
    if (inputsDisplay && inputsDisplay !== entry.inputs_summary) {
      withDisplay = { ...withDisplay, inputs_summary: inputsDisplay };
    }
    if (outputsDisplay && outputsDisplay !== entry.outputs_summary) {
      withDisplay = { ...withDisplay, outputs_summary: outputsDisplay };
    }

    if (withDisplay.step !== 'VERIFY') return withDisplay;
    const issues = withDisplay.metadata?.issues;
    if (!Array.isArray(issues) || issues.length === 0) return withDisplay;
    return {
      ...withDisplay,
      metadata: {
        ...withDisplay.metadata,
        issues: issues.map((i) =>
          sanitizeVerificationIssueForClientDisplay(
            i && typeof i === 'object' ? (i as Record<string, unknown>) : {},
          ),
        ),
      },
    };
  });
}

/**
 * 门控 / VERIFY 合成 violation 的 detail → 用户可读一句（不含 L3 管道串、弱化 VERIFY 英文壳）。
 */
export function humanizeFeasibilityMessageForUserZh(detail: string): string {
  let s = String(detail ?? '').trim();
  let codeFromVerify = '';
  const vm = s.match(VERIFY_MERGED_HEAD);
  if (vm) {
    codeFromVerify = (vm[1] ?? '').trim();
    s = s.slice(vm[0].length).trim();
  }
  s = stripLeadingL3ProofBlocks(s);
  s = stripLeadingAuditBracketTags(s);
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (codeFromVerify) {
    const label = humanizeVerifyConflictCode(codeFromVerify);
    if (!s) return label;
    if (s.startsWith(label) || s.startsWith(label.replace(/（[^）]+）$/, ''))) {
      return s;
    }
    return `${label}。${s}`;
  }
  const legacy = s.match(/^\[VERIFY\]\s*([A-Z0-9_]+)\s*:\s*/i);
  if (legacy) {
    const code = legacy[1] ?? '';
    const rest = s.slice(legacy[0].length).trim();
    const label = humanizeVerifyConflictCode(code);
    const body = stripLeadingAuditBracketTags(stripLeadingL3ProofBlocks(rest));
    return body ? `${label}。${body}` : label;
  }
  return s || '存在可执行性风险，请结合系统提示调整行程或交通方式。';
}

/**
 * itinerary.verify 等产出的 issue.message（无 `[VERIFY]` 前缀）→ 用户可见一句。
 */
export function surfaceRawVerifyIssueMessageForUserZh(message: string): string {
  let s = String(message ?? '').trim();
  s = stripLeadingL3ProofBlocks(s);
  s = stripLeadingAuditBracketTags(s);
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || '存在可执行性提示，请查看建议操作。';
}

/** 从 merge-verify 写入的 GateViolation.detail 提取 VERIFY 英文码 */
export function extractVerifyCodeFromGateViolationDetail(detail: string): string | undefined {
  const m = String(detail ?? '').trim().match(/^\[VERIFY\]\s+([A-Z0-9_]+)/i);
  return m?.[1]?.trim() || undefined;
}

function hasVerifyHardFeasibilityConflict(gate: GateResult): boolean {
  return (gate.violations ?? []).some((v) => {
    const d = String(v.detail ?? '');
    if (v.severity === 'HARD') return true;
    if (!d.includes('[VERIFY]')) return false;
    return /ROUTE_INFEASIBLE|TERRAIN_F_ROAD_UNFIT|FATIGUE_OVERLOAD/i.test(d);
  });
}

/**
 * LLM 合议可能全员 ALLOW，但 VERIFY 已写入 HARD 冲突；出站前对齐三人格展示，避免「全绿 + 红条」矛盾。
 */
export function alignGuardianResultsWithGateViolations(gate: GateResult): GateResult {
  const gr = gate.guardian_results;
  if (!gr || !hasVerifyHardFeasibilityConflict(gate)) return gate;

  const allAllow =
    gr.abu?.verdict === 'ALLOW' &&
    (gr.drdre?.verdict === 'ALLOW' || !gr.drdre?.verdict) &&
    (gr.neptune?.verdict === 'ALLOW' || !gr.neptune?.verdict);

  if (!allAllow) return gate;

  const projected = deriveGuardianPersonaVotes(gate);
  return {
    ...gate,
    guardian_results: {
      ...projected,
      source: gr.source ?? projected.source,
      is_simulated: gr.is_simulated ?? projected.is_simulated,
      debate_summary_zh: gr.debate_summary_zh,
    },
  };
}

/**
 * BFF 出站：门控 violations 用户可见副本（剥离 L3-PROOF / VERIFY 英码壳，保留审计用原始 detail 在 state 内）。
 */
export function sanitizeGateResultForClientDisplay(
  gate: GateResult,
  options?: {
    stripVerifySyntheticWhenAllow?: boolean;
    /** ITINERARY_ADJUST 草案待确认：不展示 VERIFY 合成 SOFT 卡片（与 ALLOW 无关） */
    stripVerifySyntheticForItineraryAdjust?: boolean;
    itinerary?: Itinerary | null;
    researchData?: Record<string, unknown>;
  },
): GateResult {
  const gateAlignedToItinerary = options?.itinerary
    ? filterGateViolationsAgainstItinerary(gate, options.itinerary, options.researchData)
    : gate;
  const stripHarnessSynthetic =
    options?.stripVerifySyntheticForItineraryAdjust === true ||
    (options?.stripVerifySyntheticWhenAllow === true &&
      gateAlignedToItinerary.gate_result === 'ALLOW');
  const baseViolations = stripHarnessSynthetic
    ? (gateAlignedToItinerary.violations ?? []).filter((v) => v.verify_synthetic !== true)
    : (gateAlignedToItinerary.violations ?? []);
  const aligned = alignGuardianResultsWithGateViolations({
    ...gateAlignedToItinerary,
    violations: baseViolations,
  });
  const strippedSynthetic =
    stripHarnessSynthetic && (gate.violations ?? []).some((v) => v.verify_synthetic === true);
  const gateAfterSyntheticStrip =
    strippedSynthetic && baseViolations.length === 0
      ? {
          ...aligned,
          violations: [],
          guardian_results:
            aligned.guardian_results?.source === 'llm_debate' &&
            aligned.guardian_results?.is_simulated === false
              ? aligned.guardian_results
              : deriveGuardianPersonaVotes({ ...aligned, violations: [] }),
        }
      : aligned;
  const violations = (gateAfterSyntheticStrip.violations ?? []).map((v) => {
    const raw = String(v.detail ?? '');
    const code = extractVerifyCodeFromGateViolationDetail(raw);
    const humanDetail = humanizeFeasibilityMessageForUserZh(raw);
    return {
      ...v,
      detail: humanDetail,
      ...(code ? { display_headline_zh: humanizeVerifyIssueHeadlineZh(code) } : {}),
    };
  });
  return { ...gateAfterSyntheticStrip, violations };
}

type DecisionLogish = {
  outputs_summary?: string;
  inputs_summary?: string;
};

/**
 * 决策日志单行 → 面板用短中文（去 L3 前缀、替换步骤英文缩写、控制长度）。
 */
export function simplifyDecisionLogLineForUserZh(entry: DecisionLogish): string {
  let message = String(entry.outputs_summary || entry.inputs_summary || '').trim();
  message = stripLeadingL3ProofBlocks(message);
  message = message.replace(/GATE_EVAL/g, '可行性评估');
  message = message.replace(/PLAN_GEN/g, '行程生成');
  message = message.replace(/VERIFY/g, '验证');
  message = message.replace(/REPAIR/g, '修复');
  message = message.replace(/INTAKE/g, '需求解析');
  message = message.replace(/RESEARCH/g, '数据收集');
  message = message.replace(/NARRATE/g, '说明生成');
  if (message.length > 160) {
    message = `${message.slice(0, 157)}…`;
  }
  return message;
}

function stripIntentCompileFailurePrefix(message: string): string {
  return String(message ?? '')
    .replace(/^【意图编译失败】\s*/u, '')
    .trim();
}

/** 澄清卡片 question/hint：剥离 L3-PROOF 与「意图编译失败」前缀。 */
export function sanitizeClarificationQuestionForClientDisplay(
  question: ClarificationQuestion,
): ClarificationQuestion {
  const structured = question.metadata?.structured_clarification as { message?: string } | undefined;
  const rawQuestion = structured?.message
    ? String(structured.message)
    : String(question.question ?? '');
  let questionZh = humanizeFeasibilityMessageForUserZh(stripIntentCompileFailurePrefix(rawQuestion));
  questionZh = dedupeRepeatedClarificationParagraphs(scrubInternalAgentLeakage(questionZh));
  const hintRaw = question.hint ? String(question.hint).trim() : '';
  const hint = hintRaw ? humanizeFeasibilityMessageForUserZh(hintRaw) : question.hint;

  // 契约：前端只认 single_choice + { value, label }；兼容历史 NEED_CONFIRMATION / { id, label }
  const rawType = String((question as { type?: string }).type ?? '');
  const type: ClarificationQuestion['type'] =
    rawType === 'NEED_CONFIRMATION' || rawType === 'NEED_MORE_INFO'
      ? 'single_choice'
      : (question.type as ClarificationQuestion['type']);

  const options = Array.isArray(question.options)
    ? question.options.map((opt) => {
        if (typeof opt === 'string') return opt;
        if (!opt || typeof opt !== 'object') return opt;
        const o = opt as { value?: string; label?: string; id?: string };
        const value = String(o.value ?? o.id ?? '').trim();
        const label = String(o.label ?? value).trim();
        if (!value) return opt;
        return { value, label: label || value };
      })
    : question.options;

  const hasChoiceOptions =
    Array.isArray(options) &&
    options.length > 0 &&
    options.some((o) => typeof o === 'string' || (o && typeof o === 'object' && ('value' in o || 'label' in o)));

  const metadata = {
    ...(question.metadata ?? {}),
    ...(hasChoiceOptions && type === 'single_choice' && !question.metadata?.presentation
      ? { presentation: 'structured_intake_v1' }
      : {}),
  };

  return attachClarificationMarkdownHtml({
    ...question,
    type: hasChoiceOptions && type === 'text' ? 'single_choice' : type,
    ...(options ? { options } : {}),
    metadata,
    question: questionZh,
    ...(hint ? { hint } : {}),
  });
}

export function sanitizeClarificationQuestionsForClientDisplay(
  questions: ClarificationQuestion[] | undefined,
): ClarificationQuestion[] {
  const parsed = parseClarificationQuestionsForClient(questions);
  if (parsed.length === 0) return [];
  return parsed.map(sanitizeClarificationQuestionForClientDisplay);
}
