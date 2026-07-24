/**
 * Post-LLM advisor output validation for page Copilot.
 * Rejects invented numbers, over-length copy, and unvalidated recommendations.
 */

import {
  ACTIVITY_EDITOR_SUGGESTION_MAX,
  ACTIVITY_EDITOR_SUMMARY_MAX,
  ACTIVITY_NO_VALIDATED_FALLBACK,
  type ActivityAdvisorLlmOutput,
  type ActivityAdvisorStatus,
} from '../contracts/activity-editor-ai';

export interface AdvisorValidationInput {
  output: ActivityAdvisorLlmOutput;
  hasValidatedRecommendation: boolean;
  allowedFactTokens: string[];
  /** Expected status from deterministic selector (SILENT / CONTEXT_MISSING / …). */
  expectedStatus?: ActivityAdvisorStatus;
  summaryMax?: number;
  suggestionMax?: number;
}

export interface AdvisorValidationResult {
  ok: boolean;
  output: ActivityAdvisorLlmOutput;
  reasons: string[];
}

const PAGE_TITLE_FRAGMENTS = [
  '活动编辑页',
  '日程编排',
  '规划概览',
  '执行首页',
  '决策空间',
];

export function validateAdvisorOutput(
  input: AdvisorValidationInput,
): AdvisorValidationResult {
  const reasons: string[] = [];
  let { summary, suggestion, status } = input.output;
  const summaryMax = input.summaryMax ?? ACTIVITY_EDITOR_SUMMARY_MAX;
  const suggestionMax = input.suggestionMax ?? ACTIVITY_EDITOR_SUGGESTION_MAX;

  if (input.expectedStatus && status !== input.expectedStatus) {
    // Align status to deterministic gate when LLM disagrees on terminal statuses
    if (
      input.expectedStatus === 'SILENT' ||
      input.expectedStatus === 'CONTEXT_MISSING' ||
      input.expectedStatus === 'DATA_CONFLICT'
    ) {
      reasons.push('STATUS_MISMATCH');
      status = input.expectedStatus;
    }
  }

  if ([...summary].length > summaryMax) {
    reasons.push('SUMMARY_TOO_LONG');
    summary = [...summary].slice(0, summaryMax).join('');
  }
  if ([...suggestion].length > suggestionMax) {
    reasons.push('SUGGESTION_TOO_LONG');
    suggestion = [...suggestion].slice(0, suggestionMax).join('');
  }

  for (const frag of PAGE_TITLE_FRAGMENTS) {
    if (summary.includes(frag) || suggestion.includes(frag)) {
      reasons.push('REPEATS_PAGE_TITLE');
      summary = summary.split(frag).join('');
      suggestion = suggestion.split(frag).join('');
    }
  }

  const invented = findInventedNumbers(`${summary}${suggestion}`, input.allowedFactTokens);
  if (invented.length > 0) {
    reasons.push(`INVENTED_NUMBER:${invented.join(',')}`);
  }

  const looksLikeRecommend =
    /建议|推荐|改到|移至|后移|调整/.test(suggestion) &&
    suggestion !== '请先比较方案影响。' &&
    suggestion !== '请选择活动与日期。';

  if (looksLikeRecommend && !input.hasValidatedRecommendation) {
    reasons.push('UNVALIDATED_RECOMMENDATION');
    return {
      ok: false,
      output: { ...ACTIVITY_NO_VALIDATED_FALLBACK, status: 'INSIGHT' },
      reasons,
    };
  }

  if (status === 'SILENT' && looksLikeRecommend && !input.hasValidatedRecommendation) {
    reasons.push('SILENT_WITH_RECOMMEND');
    return {
      ok: false,
      output: { status: 'SILENT', summary, suggestion: '' },
      reasons,
    };
  }

  const cleaned: ActivityAdvisorLlmOutput = {
    status,
    summary: summary.trim(),
    suggestion: suggestion.trim(),
  };

  return {
    ok: reasons.length === 0,
    output: cleaned,
    reasons,
  };
}

/** Extract standalone numbers / HH:mm from text not present in allowed tokens. */
export function findInventedNumbers(text: string, allowedTokens: string[]): string[] {
  const allowed = new Set<string>();
  for (const t of allowedTokens) {
    allowed.add(t);
    for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
      allowed.add(m[0]);
    }
    for (const m of t.matchAll(/\d{1,2}:\d{2}/g)) {
      allowed.add(m[0]);
    }
  }

  const found = new Set<string>();
  for (const m of text.matchAll(/\d{1,2}:\d{2}/g)) {
    if (!allowed.has(m[0])) found.add(m[0]);
  }
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    // Skip if part of an allowed HH:mm already checked
    if (!allowed.has(m[0])) found.add(m[0]);
  }
  return [...found];
}
