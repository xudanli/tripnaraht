/**
 * 澄清问题生成工具
 * P3 B: 从 Orchestrator 提取，供 IntakeExecutor 与 Orchestrator 共用
 *
 * 文案 Fallback 来自 `src/common/constants/agent-prompts.ts`（按 GapCode + locale）。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { ClarificationLocale } from '../../common/constants/agent-prompts';
import { buildPhysicalLowerBoundClarificationQuestion } from './structured-intake-clarification.util';
import {
  clarificationDefaultPaceOption,
  clarificationGapIntentCompileError,
  clarificationGapMissingConstraintsBudget,
  clarificationGapMissingConstraintsParty,
  clarificationGapMissingDatesDeparture,
  clarificationGapMissingDatesReturn,
  clarificationGapMissingDestination,
  clarificationGapMissingPreferencesInterests,
  clarificationGapMissingPreferencesPace,
  clarificationGapSpecTypeError,
  resolveClarificationLocale,
} from '../../common/constants/agent-prompts';

export interface GenerateClarificationQuestionsOptions {
  /** 与 `conversation_context.locale` / Accept-Language 对齐 */
  locale?: string | null;
}

export type IntakeGapType =
  | 'MISSING_DESTINATION'
  | 'MISSING_DATES'
  | 'MISSING_CONSTRAINTS'
  | 'MISSING_PREFERENCES'
  /** L4: spec schema/type check failed */
  | 'SPEC_TYPE_ERROR'
  /** L3: pre-flight lower-bound check failed */
  | 'INTENT_COMPILE_ERROR';

export interface IntakeGap {
  type: IntakeGapType;
  severity: 'HARD' | 'SOFT';
  detail: string;
}

/** 目的地尚未解析为可用地点时，不得调用 transport.search 等依赖地理的技能 */
export function isUnresolvedDestinationPlaceholder(destination: unknown): boolean {
  if (destination === undefined || destination === null) return true;
  if (typeof destination === 'object') return false;
  const s = String(destination).trim();
  return (
    s === '' ||
    s === '未指定' ||
    s === '未知' ||
    /^destination$/i.test(s)
  );
}

/** 整串为「起点/终点」等指代词而非具体地名时，不应调用 transport.search */
export function isTransportGeographicPlaceholder(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  const zh = new Set([
    '起点',
    '终点',
    '出发地',
    '目的地',
    '到达地',
    '抵达地',
    '出发站',
    '到达站',
  ]);
  if (zh.has(s)) return true;
  return ['origin', 'destination', 'start', 'end'].includes(lower);
}

/**
 * 识别缺口（降级模式）
 * 当 PlannerAgent 不可用时，使用简单规则识别缺口
 */
export function identifyGapsFromRequest(tripPlanRequest: TripPlanRequest): IntakeGap[] {
  const gaps: IntakeGap[] = [];

  if (!tripPlanRequest.destination || tripPlanRequest.destination === '未指定') {
    gaps.push({
      type: 'MISSING_DESTINATION',
      severity: 'HARD',
      detail: '缺少目的地信息',
    });
  }

  if (!tripPlanRequest.start_date && !tripPlanRequest.date_range) {
    gaps.push({
      type: 'MISSING_DATES',
      severity: 'HARD',
      detail: '缺少出行日期信息',
    });
  }

  if (!tripPlanRequest.party?.count || tripPlanRequest.party.count <= 0) {
    gaps.push({
      type: 'MISSING_CONSTRAINTS',
      severity: 'HARD',
      detail: '缺少同行人数信息',
    });
  }

  return gaps;
}

/**
 * 根据缺口生成结构化澄清问题
 */
export function generateClarificationQuestions(
  gaps: IntakeGap[],
  tripPlanRequest: TripPlanRequest,
  options?: GenerateClarificationQuestionsOptions,
): ClarificationQuestion[] {
  const locale: ClarificationLocale = resolveClarificationLocale(options?.locale ?? undefined);
  const questions: ClarificationQuestion[] = [];
  let questionId = 1;

  for (const gap of gaps) {
    switch (gap.type) {
      case 'MISSING_DESTINATION': {
        const copy = clarificationGapMissingDestination(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: copy.question,
          type: 'text',
          required: true,
          placeholder: copy.placeholder,
          hint: copy.hint,
        });
        break;
      }

      case 'MISSING_DATES': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const twoYearsLater = new Date();
        twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);

        const dep = clarificationGapMissingDatesDeparture(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: dep.question,
          type: 'date',
          required: true,
          hint: dep.hint,
          validation: {
            min: tomorrow.getTime(),
            max: twoYearsLater.getTime(),
          },
        });

        if (tripPlanRequest.start_date || tripPlanRequest.date_range?.start_date) {
          const ret = clarificationGapMissingDatesReturn(locale);
          questions.push({
            id: `question-${questionId++}`,
            question: ret.question,
            type: 'date',
            required: true,
            hint: ret.hint,
            validation: {
              min: tripPlanRequest.start_date
                ? new Date(tripPlanRequest.start_date).getTime()
                : tripPlanRequest.date_range?.start_date
                  ? new Date(tripPlanRequest.date_range.start_date).getTime()
                  : tomorrow.getTime(),
              max: twoYearsLater.getTime(),
            },
          });
        }
        break;
      }

      case 'MISSING_CONSTRAINTS': {
        const party = clarificationGapMissingConstraintsParty(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: party.question,
          type: 'single_choice',
          required: true,
          options: party.options,
          hint: party.hint,
        });
        const budget = clarificationGapMissingConstraintsBudget(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: budget.question,
          type: 'number',
          required: true,
          placeholder: budget.placeholder,
          hint: budget.hint,
          validation: { min: 100, max: 1000000 },
        });
        break;
      }

      case 'MISSING_PREFERENCES': {
        const interests = clarificationGapMissingPreferencesInterests(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: interests.question,
          type: 'multi_choice',
          required: false,
          options: interests.options,
          hint: interests.hint,
        });
        const pace = clarificationGapMissingPreferencesPace(locale);
        questions.push({
          id: `question-${questionId++}`,
          question: pace.question,
          type: 'single_choice',
          required: false,
          options: pace.options,
          hint: pace.hint,
          default: clarificationDefaultPaceOption(locale),
        });
        break;
      }

      case 'SPEC_TYPE_ERROR': {
        const copy = clarificationGapSpecTypeError(locale, gap.detail);
        questions.push({
          id: `question-${questionId++}`,
          question: copy.question,
          type: 'text',
          required: true,
          placeholder: copy.placeholder,
          hint: copy.hint,
        });
        break;
      }

      case 'INTENT_COMPILE_ERROR': {
        const structured = buildPhysicalLowerBoundClarificationQuestion(
          tripPlanRequest,
          gap,
          (tripPlanRequest as { message?: string }).message,
        );
        questions.push({
          ...structured,
          id: structured.id || `question-${questionId++}`,
          hint: structured.hint ?? clarificationGapIntentCompileError(locale, gap.detail).hint,
        });
        break;
      }
    }
  }

  return questions;
}
