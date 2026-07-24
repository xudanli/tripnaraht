/**
 * Nara page advisor narrative — short Chinese copy for Insight Card.
 * Trip facts from Context Builder are SSOT; RAG (if any) is clause knowledge only.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { parseJsonFromLlmText } from '../../../llm/utils/parse-llm-json.util';
import type { DeterministicInsightSelection } from './decision-space-insight.selector';
import {
  buildInsuranceAdvisorFromContext,
  isIrresponsibleInsuranceAdvice,
  type InsuranceDecisionContext,
} from '../contracts/insurance-decision-context.types';
import {
  buildVehicleAdvisorFromContext,
  type VehicleDecisionContext,
} from '../contracts/vehicle-decision-context.types';
import type { InsuranceClauseKnowledge } from './insurance-clause-knowledge.service';
import { GENERIC_CONFLICT_ADVISOR_PROMPT } from '../contracts/generic-conflict-ai';
import {
  ACTIVITY_EDITOR_PAGE_PROMPT,
  ACTIVITY_EDITOR_SUGGESTION_MAX,
  ACTIVITY_EDITOR_SUMMARY_MAX,
  ACTIVITY_EDITOR_TITLE_MAX,
  NARA_UNIFIED_SYSTEM_PROMPT,
  type ActivityAdvisorLlmOutput,
  type ActivityAdvisorStatus,
} from '../contracts/activity-editor-ai';
import type { ActivityEditorInsightSelection } from './activity-editor-insight.selector';
import type { ItineraryDayEditorInsightSelection } from './itinerary-day-editor-insight.selector';
import { validateAdvisorOutput } from './advisor-output.validator';
import {
  DAY_EDITOR_SUGGESTION_MAX,
  DAY_EDITOR_SUMMARY_MAX,
  DAY_EDITOR_TITLE_MAX,
  ITINERARY_DAY_EDITOR_PAGE_PROMPT,
  NARA_UNIFIED_SYSTEM_PROMPT as DAY_UNIFIED_SYSTEM,
  type DayAdvisorLlmOutput,
  type DayAdvisorStatus,
} from '../contracts/itinerary-day-editor-ai';
import type { PlanningOverviewInsightSelection } from './planning-overview-insight.selector';
import {
  OVERVIEW_SUGGESTION_MAX,
  OVERVIEW_SUMMARY_MAX,
  OVERVIEW_TITLE_MAX,
  PLANNING_OVERVIEW_PAGE_PROMPT,
  NARA_UNIFIED_SYSTEM_PROMPT as OVERVIEW_UNIFIED_SYSTEM,
  type OverviewAdvisorLlmOutput,
  type OverviewAdvisorStatus,
} from '../contracts/planning-overview-ai';
import type { ExecutionHomeInsightSelection } from './execution-home-insight.selector';
import {
  EXEC_SUGGESTION_MAX,
  EXEC_SUMMARY_MAX,
  EXEC_TITLE_MAX,
  EXECUTION_HOME_PAGE_PROMPT,
  NARA_UNIFIED_SYSTEM_PROMPT as EXEC_UNIFIED_SYSTEM,
  type ExecAdvisorLlmOutput,
  type ExecAdvisorStatus,
} from '../contracts/execution-home-ai';

export interface AdvisorCopy {
  /** ≤12 汉字 — card title */
  title: string;
  /** 说明 / 情况 — ≤40 汉字 */
  body: string;
  /** 建议 — ≤24 汉字 */
  advice: string;
}

export interface NarrativePolishResult {
  forceSilent?: boolean;
  advisorCopy: AdvisorCopy;
  llmUsed: boolean;
  degradedReason?: string;
}

const ADVISOR_SYSTEM = `你是 Nara 行程决策顾问。

根据系统提供的行程事实、决策结果和候选方案，向用户简短解释当前决策。

要求：
1. 只使用提供的信息，不自行判断规则。
2. 说明与当前行程直接相关的依据。
3. 先说结论，再说影响，最后给出下一步。
4. 不重复页面标题和选项文案。
5. 最多60个汉字。
6. 依据不足时返回 silent=true（CONTEXT_MISSING 由服务端门禁处理）。
7. 无实际价值时返回 silent=true。

输出 JSON（不要 Markdown）：
{"silent":false,"title":"不超过12字","body":"说明一句话","advice":"建议一句话"}`;

const VEHICLE_EXTRA = `针对车型选择：
先说明影响车型的行程事实（尤其是否含 F-road），再推荐车型及原因，最后说明失效条件。禁止「请确认车型」任务复述。`;

const INSURANCE_EXTRA = `针对租车保险：
必须基于车型、路线暴露、季节与已有保障推荐；不得只讲通用保险知识。
硬约束：涉水/过河通常各档均不保——这是出行约束，禁止因此推荐「基础 CDW」。
有碎石暴露时应指向含碎石 GP 的方案；条款知识仅作补充说明，不决定档位。`;

@Injectable()
export class PageInsightNarrativeService {
  private readonly logger = new Logger(PageInsightNarrativeService.name);

  constructor(@Optional() private readonly llm?: LlmService) {}

  /**
   * Activity Editor narrative — summary/suggestion → advisorCopy body/advice.
   */
  async polishActivityEditor(
    selection: ActivityEditorInsightSelection,
    ctx?: {
      activity?: string;
      targetDay?: string;
      dayPlan?: string;
      assessment?: string;
      validatedRecommendation?: string;
    },
  ): Promise<NarrativePolishResult> {
    if (selection.mode === 'SILENT' && selection.modeReason === 'NO_MATERIAL_IMPACT') {
      return {
        forceSilent: true,
        advisorCopy: {
          title: '暂无提醒',
          body: selection.ruleSummary,
          advice: selection.ruleSuggestion,
        },
        llmUsed: false,
      };
    }

    const expectedStatus = modeReasonToAdvisorStatus(selection.modeReason, selection.mode);
    const ruleOutput: ActivityAdvisorLlmOutput = {
      status: expectedStatus,
      summary: selection.ruleSummary,
      suggestion: selection.ruleSuggestion,
    };

    if (
      selection.modeReason === 'CONTEXT_MISSING' ||
      selection.modeReason === 'NO_VALIDATED_RECOMMENDATION'
    ) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
      });
      return {
        advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: selection.modeReason,
      };
    }

    if (!this.llm) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
      });
      return {
        advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }

    try {
      const prompt = [
        NARA_UNIFIED_SYSTEM_PROMPT,
        '',
        ACTIVITY_EDITOR_PAGE_PROMPT,
        '',
        '输入：',
        `活动：${ctx?.activity ?? selection.factRefs.join(',')}`,
        `目标日期：${ctx?.targetDay ?? '-'}`,
        `当天安排：${ctx?.dayPlan ?? '-'}`,
        `验证结果：${ctx?.assessment ?? selection.observationSummary}`,
        `已验证推荐：${ctx?.validatedRecommendation ?? selection.recommendation?.summary ?? '无'}`,
        `系统规则文案：${selection.ruleSummary} / ${selection.ruleSuggestion}`,
        `modeReason：${selection.modeReason ?? '-'}`,
      ].join('\n');

      const provider = this.llm.getDefaultProvider();
      const rawPromise = this.llm.callLlmWithSchema(provider, prompt, {
        type: 'object',
        properties: {
          status: { type: 'string' },
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['status', 'summary', 'suggestion'],
      });
      const raw = await Promise.race([
        rawPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), 4000),
        ),
      ]);

      const parsed = parseActivityAdvisorJson(String(raw));
      if (!parsed) {
        const validated = validateAdvisorOutput({
          output: ruleOutput,
          hasValidatedRecommendation: selection.hasValidatedRecommendation,
          allowedFactTokens: selection.allowedFactTokens,
          expectedStatus,
        });
        return {
          advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: false,
          degradedReason: 'LLM_PARSE_FAILED',
        };
      }

      const validated = validateAdvisorOutput({
        output: parsed,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
      });

      if (validated.output.status === 'SILENT') {
        return {
          forceSilent: true,
          advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: true,
        };
      }

      return {
        advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: true,
        degradedReason: validated.ok ? undefined : validated.reasons.join(','),
      };
    } catch (err) {
      this.logger.warn(
        `activity advisor narrative skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
      });
      return {
        advisorCopy: activityOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }
  }

  /**
   * Day Editor narrative — summary/suggestion → advisorCopy.
   */
  async polishItineraryDayEditor(
    selection: ItineraryDayEditorInsightSelection,
    ctx?: {
      selectedDay?: string;
      dayPlan?: string;
      dayPlanStatus?: string;
      gaps?: string;
      pendingBookings?: string;
      conflictAssessment?: string;
      validatedRecommendation?: string;
    },
  ): Promise<NarrativePolishResult> {
    if (selection.mode === 'SILENT' && selection.modeReason === 'DAY_CLEAR') {
      return {
        forceSilent: true,
        advisorCopy: {
          title: '暂无提醒',
          body: selection.ruleSummary,
          advice: selection.ruleSuggestion,
        },
        llmUsed: false,
      };
    }

    const expectedStatus = modeReasonToAdvisorStatus(selection.modeReason, selection.mode);
    const ruleOutput: DayAdvisorLlmOutput = {
      status: expectedStatus,
      summary: selection.ruleSummary,
      suggestion: selection.ruleSuggestion,
    };

    // Deterministic day-planning copy — do not let LLM invent system tips.
    if (
      selection.modeReason === 'CONTEXT_MISSING' ||
      selection.modeReason === 'NO_VALIDATED_RECOMMENDATION' ||
      selection.modeReason === 'DAY_INCOMPLETE' ||
      selection.modeReason === 'DAY_OPTIMIZABLE' ||
      selection.modeReason === 'DAY_TIGHT'
    ) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: DAY_EDITOR_SUMMARY_MAX,
        suggestionMax: DAY_EDITOR_SUGGESTION_MAX,
      });
      return {
        advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason:
          selection.modeReason === 'DAY_INCOMPLETE' ||
          selection.modeReason === 'DAY_OPTIMIZABLE' ||
          selection.modeReason === 'DAY_TIGHT'
            ? undefined
            : selection.modeReason,
      };
    }

    if (!this.llm) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: DAY_EDITOR_SUMMARY_MAX,
        suggestionMax: DAY_EDITOR_SUGGESTION_MAX,
      });
      return {
        advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }

    try {
      const prompt = [
        DAY_UNIFIED_SYSTEM,
        '',
        ITINERARY_DAY_EDITOR_PAGE_PROMPT,
        '',
        '输入：',
        `当前日期：${ctx?.selectedDay ?? '-'}`,
        `当天状态：${ctx?.dayPlanStatus ?? selection.dayPlanStatus ?? '-'}`,
        `当天日程：${ctx?.dayPlan ?? '-'}`,
        `空档：${ctx?.gaps ?? '-'}`,
        `待预订：${ctx?.pendingBookings ?? '-'}`,
        `冲突结果：${ctx?.conflictAssessment ?? selection.observationSummary}`,
        `已验证方案：${ctx?.validatedRecommendation ?? selection.recommendation?.summary ?? '无'}`,
        `系统规则文案：${selection.ruleSummary} / ${selection.ruleSuggestion}`,
        `modeReason：${selection.modeReason ?? '-'}`,
      ].join('\n');

      const provider = this.llm.getDefaultProvider();
      const rawPromise = this.llm.callLlmWithSchema(provider, prompt, {
        type: 'object',
        properties: {
          status: { type: 'string' },
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['status', 'summary', 'suggestion'],
      });
      const raw = await Promise.race([
        rawPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), 4000),
        ),
      ]);

      const parsed = parseDayAdvisorJson(String(raw));
      if (!parsed) {
        const validated = validateAdvisorOutput({
          output: ruleOutput,
          hasValidatedRecommendation: selection.hasValidatedRecommendation,
          allowedFactTokens: selection.allowedFactTokens,
          expectedStatus,
          summaryMax: DAY_EDITOR_SUMMARY_MAX,
          suggestionMax: DAY_EDITOR_SUGGESTION_MAX,
        });
        return {
          advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: false,
          degradedReason: 'LLM_PARSE_FAILED',
        };
      }

      const validated = validateAdvisorOutput({
        output: parsed,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: DAY_EDITOR_SUMMARY_MAX,
        suggestionMax: DAY_EDITOR_SUGGESTION_MAX,
      });

      if (validated.output.status === 'SILENT') {
        return {
          forceSilent: true,
          advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: true,
        };
      }

      return {
        advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: true,
        degradedReason: validated.ok ? undefined : validated.reasons.join(','),
      };
    } catch (err) {
      this.logger.warn(
        `day advisor narrative skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: DAY_EDITOR_SUMMARY_MAX,
        suggestionMax: DAY_EDITOR_SUGGESTION_MAX,
      });
      return {
        advisorCopy: dayOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }
  }

  /**
   * Planning Overview narrative — trip-level priority copy.
   */
  async polishPlanningOverview(
    selection: PlanningOverviewInsightSelection,
    ctx?: {
      tripSummary?: string;
      blockingIssues?: string;
      priorityAction?: string;
      unlockHint?: string;
    },
  ): Promise<NarrativePolishResult> {
    if (selection.mode === 'SILENT' && selection.modeReason === 'TRIP_CLEAR') {
      return {
        forceSilent: true,
        advisorCopy: {
          title: '暂无提醒',
          body: selection.ruleSummary,
          advice: selection.ruleSuggestion,
        },
        llmUsed: false,
      };
    }

    const expectedStatus = modeReasonToAdvisorStatus(selection.modeReason, selection.mode);
    const ruleOutput: OverviewAdvisorLlmOutput = {
      status: expectedStatus,
      summary: selection.ruleSummary,
      suggestion: selection.ruleSuggestion,
    };

    if (selection.modeReason === 'CONTEXT_MISSING') {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: OVERVIEW_SUMMARY_MAX,
        suggestionMax: OVERVIEW_SUGGESTION_MAX,
      });
      return {
        advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: selection.modeReason,
      };
    }

    if (!this.llm) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: OVERVIEW_SUMMARY_MAX,
        suggestionMax: OVERVIEW_SUGGESTION_MAX,
      });
      return {
        advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }

    try {
      const prompt = [
        OVERVIEW_UNIFIED_SYSTEM,
        '',
        PLANNING_OVERVIEW_PAGE_PROMPT,
        '',
        '输入：',
        `行程状态：${ctx?.tripSummary ?? '-'}`,
        `主要阻塞：${ctx?.blockingIssues ?? selection.observationSummary}`,
        `优先事项：${ctx?.priorityAction ?? selection.ruleSuggestion}`,
        `解锁说明：${ctx?.unlockHint ?? '-'}`,
        `系统规则文案：${selection.ruleSummary} / ${selection.ruleSuggestion}`,
        `modeReason：${selection.modeReason ?? '-'}`,
      ].join('\n');

      const provider = this.llm.getDefaultProvider();
      const rawPromise = this.llm.callLlmWithSchema(provider, prompt, {
        type: 'object',
        properties: {
          status: { type: 'string' },
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['status', 'summary', 'suggestion'],
      });
      const raw = await Promise.race([
        rawPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), 4000),
        ),
      ]);

      const parsed = parseOverviewAdvisorJson(String(raw));
      if (!parsed) {
        const validated = validateAdvisorOutput({
          output: ruleOutput,
          hasValidatedRecommendation: selection.hasValidatedRecommendation,
          allowedFactTokens: selection.allowedFactTokens,
          expectedStatus,
          summaryMax: OVERVIEW_SUMMARY_MAX,
          suggestionMax: OVERVIEW_SUGGESTION_MAX,
        });
        return {
          advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: false,
          degradedReason: 'LLM_PARSE_FAILED',
        };
      }

      const validated = validateAdvisorOutput({
        output: parsed,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: OVERVIEW_SUMMARY_MAX,
        suggestionMax: OVERVIEW_SUGGESTION_MAX,
      });

      if (validated.output.status === 'SILENT') {
        return {
          forceSilent: true,
          advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: true,
        };
      }

      return {
        advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: true,
        degradedReason: validated.ok ? undefined : validated.reasons.join(','),
      };
    } catch (err) {
      this.logger.warn(
        `overview advisor narrative skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: OVERVIEW_SUMMARY_MAX,
        suggestionMax: OVERVIEW_SUGGESTION_MAX,
      });
      return {
        advisorCopy: overviewOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }
  }

  /**
   * Execution Home narrative — real-time safety / schedule copy.
   */
  async polishExecutionHome(
    selection: ExecutionHomeInsightSelection,
    ctx?: {
      currentState?: string;
      nextActivity?: string;
      executionRisk?: string;
      interventionDeadline?: string;
      advisory?: string;
    },
  ): Promise<NarrativePolishResult> {
    if (selection.mode === 'SILENT' && selection.modeReason === 'EXEC_ON_TRACK') {
      return {
        forceSilent: true,
        advisorCopy: {
          title: '暂无提醒',
          body: selection.ruleSummary,
          advice: selection.ruleSuggestion,
        },
        llmUsed: false,
      };
    }

    const expectedStatus = modeReasonToAdvisorStatus(selection.modeReason, selection.mode);
    const ruleOutput: ExecAdvisorLlmOutput = {
      status: expectedStatus,
      summary: selection.ruleSummary,
      suggestion: selection.ruleSuggestion,
    };

    if (
      selection.modeReason === 'CONTEXT_MISSING' ||
      !selection.hasValidatedRecommendation
    ) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: EXEC_SUMMARY_MAX,
        suggestionMax: EXEC_SUGGESTION_MAX,
      });
      return {
        advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason:
          selection.modeReason === 'CONTEXT_MISSING'
            ? selection.modeReason
            : selection.hasValidatedRecommendation
              ? undefined
              : 'NO_VALIDATED_RECOMMENDATION',
      };
    }

    if (!this.llm) {
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: EXEC_SUMMARY_MAX,
        suggestionMax: EXEC_SUGGESTION_MAX,
      });
      return {
        advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }

    try {
      const prompt = [
        EXEC_UNIFIED_SYSTEM,
        '',
        EXECUTION_HOME_PAGE_PROMPT,
        '',
        '输入：',
        `当前时间与位置：${ctx?.currentState ?? '-'}`,
        `下一活动：${ctx?.nextActivity ?? '-'}`,
        `执行风险：${ctx?.executionRisk ?? selection.observationSummary}`,
        `最晚行动时间：${ctx?.interventionDeadline ?? '-'}`,
        `顾问结论：${ctx?.advisory ?? '-'}`,
        `系统规则文案：${selection.ruleSummary} / ${selection.ruleSuggestion}`,
        `modeReason：${selection.modeReason ?? '-'}`,
      ].join('\n');

      const provider = this.llm.getDefaultProvider();
      const rawPromise = this.llm.callLlmWithSchema(provider, prompt, {
        type: 'object',
        properties: {
          status: { type: 'string' },
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['status', 'summary', 'suggestion'],
      });
      const raw = await Promise.race([
        rawPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), 4000),
        ),
      ]);

      const parsed = parseExecAdvisorJson(String(raw));
      if (!parsed) {
        const validated = validateAdvisorOutput({
          output: ruleOutput,
          hasValidatedRecommendation: selection.hasValidatedRecommendation,
          allowedFactTokens: selection.allowedFactTokens,
          expectedStatus,
          summaryMax: EXEC_SUMMARY_MAX,
          suggestionMax: EXEC_SUGGESTION_MAX,
        });
        return {
          advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: false,
          degradedReason: 'LLM_PARSE_FAILED',
        };
      }

      const validated = validateAdvisorOutput({
        output: parsed,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: EXEC_SUMMARY_MAX,
        suggestionMax: EXEC_SUGGESTION_MAX,
      });

      if (validated.output.status === 'SILENT') {
        return {
          forceSilent: true,
          advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
          llmUsed: true,
        };
      }

      return {
        advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: true,
        degradedReason: validated.ok ? undefined : validated.reasons.join(','),
      };
    } catch (err) {
      this.logger.warn(
        `execution advisor narrative skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      const validated = validateAdvisorOutput({
        output: ruleOutput,
        hasValidatedRecommendation: selection.hasValidatedRecommendation,
        allowedFactTokens: selection.allowedFactTokens,
        expectedStatus,
        summaryMax: EXEC_SUMMARY_MAX,
        suggestionMax: EXEC_SUGGESTION_MAX,
      });
      return {
        advisorCopy: execOutputToAdvisorCopy(validated.output, selection.title),
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }
  }

  async polish(
    selection: DeterministicInsightSelection,
    ctx?: {
      pageName?: string;
      currentTask?: string;
      pageVisibleSummary?: string;
      insuranceContext?: InsuranceDecisionContext;
      vehicleContext?: VehicleDecisionContext;
      isRentalInsurance?: boolean;
      isVehicleRoadFit?: boolean;
      casePromptHint?: string;
      caseAiMode?: string;
      insuranceClauseKnowledge?: InsuranceClauseKnowledge;
    },
  ): Promise<NarrativePolishResult> {
    if (selection.mode === 'SILENT') {
      return {
        forceSilent: true,
        advisorCopy: {
          title: '暂无提醒',
          body: '当前无需主动说明。',
          advice: '继续处理即可',
        },
        llmUsed: false,
      };
    }

    if (selection.modeReason === 'CONTEXT_MISSING') {
      return {
        advisorCopy: clampAdvisorCopy({
          title: selection.title,
          body: selection.observationSummary,
          advice: selection.recommendation?.summary ?? '先完善行程信息',
        }),
        llmUsed: false,
        degradedReason: 'CONTEXT_MISSING',
      };
    }

    if (
      selection.modeReason === 'NO_VALIDATED_RECOMMENDATION' ||
      selection.modeReason === 'DATA_CONFLICT'
    ) {
      return {
        advisorCopy: clampAdvisorCopy({
          title: selection.title,
          body: selection.observationSummary,
          advice: '先查看方案影响再决定',
        }),
        llmUsed: false,
        degradedReason: selection.modeReason,
      };
    }

    const ruleCopy = buildRuleAdvisorCopy(
      selection,
      ctx?.pageVisibleSummary,
      ctx?.insuranceContext,
      ctx?.vehicleContext,
    );
    if (!this.llm) {
      return { advisorCopy: ruleCopy, llmUsed: false, degradedReason: 'LLM_UNAVAILABLE' };
    }

    try {
      const vehicleBlock =
        ctx?.vehicleContext?.gate.ok
          ? [
              `* 路线事实：${JSON.stringify(ctx.vehicleContext.advisorInput.routeFacts)}`,
              `* 团队事实：${JSON.stringify(ctx.vehicleContext.advisorInput.teamFacts)}`,
              `* 系统推荐：${JSON.stringify(ctx.vehicleContext.advisorInput.recommendation)}`,
              `* 失效条件：${ctx.vehicleContext.invalidatedWhen.join('、')}`,
            ].join('\n')
          : '';

      const insuranceFacts = ctx?.insuranceContext?.confirmedFacts?.length
        ? ctx.insuranceContext.confirmedFacts.join('；')
        : '';

      const clauseBlock =
        ctx?.insuranceClauseKnowledge?.clauseNotes?.length
          ? `* 条款知识（仅解释，不可决定档位；来源=${ctx.insuranceClauseKnowledge.source}）：${ctx.insuranceClauseKnowledge.clauseNotes.join('；')}`
          : '';

      const responsibleHint = ctx?.isRentalInsurance
        ? `* 系统责任推荐（必须遵守）：${ruleCopy.body} → ${ruleCopy.advice}`
        : '';

      const isScheduleConflict =
        selection.caseAiSemanticKey === 'CANONICAL.SCHEDULE_CONFLICT' ||
        selection.modeReason === 'NO_VALIDATED_RECOMMENDATION' ||
        selection.modeReason === 'DATA_CONFLICT';

      const prompt = [
        isScheduleConflict ? GENERIC_CONFLICT_ADVISOR_PROMPT : ADVISOR_SYSTEM,
        ctx?.casePromptHint && !isScheduleConflict
          ? `本案策略（${ctx.caseAiMode ?? ''}）：\n${ctx.casePromptHint}`
          : '',
        ctx?.isVehicleRoadFit ? VEHICLE_EXTRA : '',
        ctx?.isRentalInsurance ? INSURANCE_EXTRA : '',
        '',
        '输入：',
        `* 当前页面：${ctx?.pageName ?? '决策空间'}`,
        `* 用户正在处理：${ctx?.currentTask ?? selection.title}`,
        `* 系统判断：${selection.observationSummary}`,
        `* 主要原因：${selection.explanationSummary}`,
        `* 影响：${selection.impacts.map((i) => i.summary).join('；') || '无'}`,
        `* 推荐方案：${selection.recommendation?.summary ?? '无（勿强行推荐）'}`,
        `* modeReason：${selection.modeReason ?? '-'}`,
        insuranceFacts ? `* 已确认行程事实：${insuranceFacts}` : '',
        responsibleHint,
        clauseBlock,
        vehicleBlock,
        `* 页面已展示文案（禁止复述）：${ctx?.pageVisibleSummary ?? selection.title}`,
      ]
        .filter(Boolean)
        .join('\n');

      const provider = this.llm.getDefaultProvider();
      const rawPromise = this.llm.callLlmWithSchema(provider, prompt, {
        type: 'object',
        properties: {
          silent: { type: 'boolean' },
          title: { type: 'string' },
          body: { type: 'string' },
          advice: { type: 'string' },
          explanation: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['title', 'body', 'advice'],
      });

      const polished = await Promise.race([
        rawPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);

      if (!polished) {
        return { advisorCopy: ruleCopy, llmUsed: false, degradedReason: 'LLM_TIMEOUT' };
      }

      const parsed = parseAdvisorJson(polished);
      if (!parsed) {
        return { advisorCopy: ruleCopy, llmUsed: false, degradedReason: 'LLM_PARSE_FAILED' };
      }

      if (parsed.silent) {
        return {
          forceSilent: true,
          advisorCopy: clampAdvisorCopy(parsed),
          llmUsed: true,
        };
      }

      const clamped = clampAdvisorCopy(parsed);
      if (
        ctx?.pageVisibleSummary &&
        isNearDuplicate(clamped.body, ctx.pageVisibleSummary)
      ) {
        return {
          advisorCopy: ruleCopy,
          llmUsed: true,
          degradedReason: 'LLM_DUPLICATE_PAGE',
        };
      }

      if (/请确认|需从四类|重新验证路线/.test(`${clamped.title}${clamped.body}`)) {
        return {
          advisorCopy: ruleCopy,
          llmUsed: true,
          degradedReason: 'LLM_TASK_ECHO',
        };
      }

      if (
        ctx?.isRentalInsurance &&
        isIrresponsibleInsuranceAdvice(`${clamped.title}${clamped.body}${clamped.advice}`)
      ) {
        return {
          advisorCopy: ruleCopy,
          llmUsed: true,
          degradedReason: 'LLM_IRRESPONSIBLE_FORDING',
        };
      }

      return { advisorCopy: clamped, llmUsed: true };
    } catch (err) {
      this.logger.warn(
        `advisor narrative skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        advisorCopy: ruleCopy,
        llmUsed: false,
        degradedReason: 'LLM_UNAVAILABLE',
      };
    }
  }
}

export function buildRuleAdvisorCopy(
  selection: DeterministicInsightSelection,
  pageVisibleSummary?: string,
  insuranceContext?: InsuranceDecisionContext,
  vehicleContext?: VehicleDecisionContext,
): AdvisorCopy {
  const page = (pageVisibleSummary ?? '').trim();

  if (selection.modeReason === 'CONTEXT_MISSING') {
    return clampAdvisorCopy({
      title: selection.title,
      body: selection.observationSummary,
      advice: selection.recommendation?.summary ?? '先完善行程信息',
    });
  }

  if (vehicleContext?.gate.ok) {
    return clampAdvisorCopy(buildVehicleAdvisorFromContext(vehicleContext));
  }

  if (insuranceContext?.gate.ok || insuranceContext?.confirmedFacts?.length) {
    return clampAdvisorCopy(buildInsuranceAdvisorFromContext(insuranceContext));
  }

  if (selection.modeReason === 'MATERIAL_OPTION_DIVERGENCE') {
    return clampAdvisorCopy({
      title: '方案取舍不同',
      body: '各选项耗时、费用与强度不同，比选后再确认。',
      advice: extractShortAdvice(selection) || '在下方选定一项',
    });
  }

  if (
    selection.modeReason === 'BLOCKING_DECISION' ||
    selection.modeReason === 'SAFETY_RELATED_DECISION'
  ) {
    return clampAdvisorCopy({
      title: '需先完成确认',
      body: '未确认会挡住后续安排，请选定方案。',
      advice: '选定后点确认',
    });
  }

  if (selection.modeReason === 'EXPLICIT_ASK') {
    return clampAdvisorCopy({
      title: clampChars(selection.title, 12) || '顾问说明',
      body: avoidPageEcho(
        selection.observationSummary ||
          selection.impacts[0]?.summary ||
          '聚焦选项差异再决定。',
        page,
      ),
      advice: extractShortAdvice(selection) || '按推荐选项确认',
    });
  }

  return clampAdvisorCopy({
    title: clampChars(selection.title, 12) || '当前判断',
    body: avoidPageEcho(
      selection.impacts.map((i) => i.summary).filter(Boolean).join('；') ||
        selection.explanationSummary,
      page,
    ),
    advice: extractShortAdvice(selection) || '查看并确认选项',
  });
}

function extractShortAdvice(selection: DeterministicInsightSelection): string {
  const s = selection.recommendation?.summary ?? '';
  const m = /「([^」]+)」/.exec(s);
  if (m?.[1]) return `选「${clampChars(m[1], 10)}」`;
  if (s.includes('短线')) return '优先选短线体验';
  if (s.includes('徒步')) return '可选冰川徒步';
  if (s.includes('碎石')) return '优先选含碎石险方案';
  if (s.includes('两驱')) return '优先选两驱小型车';
  if (s.includes('四驱')) return '优先选四驱';
  return clampChars(s.replace(/^建议选择/, '').trim(), 24);
}

function avoidPageEcho(candidate: string, page: string): string {
  const c = candidate.trim();
  if (!c) return '请比较下方选项后确认。';
  if (page && isNearDuplicate(c, page)) {
    return '请比较下方选项的时间与强度差异。';
  }
  return c;
}

function isNearDuplicate(a: string, b: string): boolean {
  const x = a.replace(/\s/g, '');
  const y = b.replace(/\s/g, '');
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const n = Math.min(20, x.length, y.length);
  return n >= 12 && x.slice(0, n) === y.slice(0, n);
}

function parseAdvisorJson(raw: string): {
  silent?: boolean;
  title: string;
  body: string;
  advice: string;
} | null {
  const parsed = parseJsonFromLlmText(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') {
    return parseLabeledAdvisor(raw);
  }
  const title = typeof parsed.title === 'string' ? parsed.title : '';
  const body =
    typeof parsed.body === 'string'
      ? parsed.body
      : typeof parsed.explanation === 'string'
        ? parsed.explanation
        : typeof parsed.情况 === 'string'
          ? (parsed.情况 as string)
          : typeof parsed.说明 === 'string'
            ? (parsed.说明 as string)
            : '';
  const advice =
    typeof parsed.advice === 'string'
      ? parsed.advice
      : typeof parsed.suggestion === 'string'
        ? parsed.suggestion
        : typeof parsed.建议 === 'string'
          ? (parsed.建议 as string)
          : '';
  if (!title && !body && !advice) return null;
  return {
    silent: parsed.silent === true,
    title: title || '当前判断',
    body: body || '请比较下方选项。',
    advice: advice || '选定后确认',
  };
}

function parseLabeledAdvisor(raw: string): {
  silent?: boolean;
  title: string;
  body: string;
  advice: string;
} | null {
  if (
    /silent\s*[:=]\s*true/i.test(raw) ||
    /CONTEXT_MISSING/i.test(raw) ||
    /返回\s*`?SILENT`?/.test(raw)
  ) {
    return {
      silent: true,
      title: '暂无提醒',
      body: '当前无需主动说明。',
      advice: '继续即可',
    };
  }
  const title = /标题[:：]\s*(.+)/.exec(raw)?.[1]?.trim();
  const body = /(?:说明|情况)[:：]\s*(.+)/.exec(raw)?.[1]?.trim();
  const advice = /建议[:：]\s*(.+)/.exec(raw)?.[1]?.trim();
  if (!title && !body && !advice) return null;
  return {
    title: title || '当前判断',
    body: body || '请比较下方选项。',
    advice: advice || '选定后确认',
  };
}

export function clampAdvisorCopy(input: {
  title: string;
  body: string;
  advice: string;
}): AdvisorCopy {
  let title = clampChars(input.title, 12);
  let body = clampChars(input.body, 40);
  let advice = clampChars(input.advice, 24);
  const total = [...body].length + [...advice].length;
  if (total > 60) {
    const bodyMax = Math.max(20, 60 - [...advice].length);
    body = clampChars(body, bodyMax);
  }
  return { title, body, advice };
}

export function clampChars(text: string, max: number): string {
  const chars = [...(text ?? '').trim()];
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max).join('');
}

function activityOutputToAdvisorCopy(
  output: ActivityAdvisorLlmOutput,
  fallbackTitle: string,
): AdvisorCopy {
  return clampAdvisorCopy({
    title: clampChars(fallbackTitle, ACTIVITY_EDITOR_TITLE_MAX),
    body: clampChars(output.summary, ACTIVITY_EDITOR_SUMMARY_MAX),
    advice: clampChars(output.suggestion, ACTIVITY_EDITOR_SUGGESTION_MAX),
  });
}

function modeReasonToAdvisorStatus(
  modeReason: string | undefined,
  mode: string,
): ActivityAdvisorStatus {
  if (modeReason === 'CONTEXT_MISSING') return 'CONTEXT_MISSING';
  if (modeReason === 'DATA_CONFLICT') return 'DATA_CONFLICT';
  if (mode === 'SILENT') return 'SILENT';
  return 'INSIGHT';
}

function parseActivityAdvisorJson(raw: string): ActivityAdvisorLlmOutput | null {
  const parsed = parseJsonFromLlmText(raw) as Partial<ActivityAdvisorLlmOutput> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const status = String(parsed.status ?? 'INSIGHT') as ActivityAdvisorStatus;
  const summary = String(parsed.summary ?? '').trim();
  const suggestion = String(parsed.suggestion ?? '').trim();
  if (!summary && !suggestion) return null;
  if (
    status !== 'INSIGHT' &&
    status !== 'SILENT' &&
    status !== 'CONTEXT_MISSING' &&
    status !== 'DATA_CONFLICT'
  ) {
    return { status: 'INSIGHT', summary, suggestion };
  }
  return { status, summary, suggestion };
}

function dayOutputToAdvisorCopy(
  output: DayAdvisorLlmOutput,
  fallbackTitle: string,
): AdvisorCopy {
  return clampAdvisorCopy({
    title: clampChars(fallbackTitle, DAY_EDITOR_TITLE_MAX),
    body: clampChars(output.summary, DAY_EDITOR_SUMMARY_MAX),
    advice: clampChars(output.suggestion, DAY_EDITOR_SUGGESTION_MAX),
  });
}

function parseDayAdvisorJson(raw: string): DayAdvisorLlmOutput | null {
  const parsed = parseJsonFromLlmText(raw) as Partial<DayAdvisorLlmOutput> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const status = String(parsed.status ?? 'INSIGHT') as DayAdvisorStatus;
  const summary = String(parsed.summary ?? '').trim();
  const suggestion = String(parsed.suggestion ?? '').trim();
  if (!summary && !suggestion) return null;
  if (
    status !== 'INSIGHT' &&
    status !== 'SILENT' &&
    status !== 'CONTEXT_MISSING' &&
    status !== 'DATA_CONFLICT'
  ) {
    return { status: 'INSIGHT', summary, suggestion };
  }
  return { status, summary, suggestion };
}

function overviewOutputToAdvisorCopy(
  output: OverviewAdvisorLlmOutput,
  fallbackTitle: string,
): AdvisorCopy {
  return clampAdvisorCopy({
    title: clampChars(fallbackTitle, OVERVIEW_TITLE_MAX),
    body: clampChars(output.summary, OVERVIEW_SUMMARY_MAX),
    advice: clampChars(output.suggestion, OVERVIEW_SUGGESTION_MAX),
  });
}

function parseOverviewAdvisorJson(raw: string): OverviewAdvisorLlmOutput | null {
  const parsed = parseJsonFromLlmText(raw) as Partial<OverviewAdvisorLlmOutput> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const status = String(parsed.status ?? 'INSIGHT') as OverviewAdvisorStatus;
  const summary = String(parsed.summary ?? '').trim();
  const suggestion = String(parsed.suggestion ?? '').trim();
  if (!summary && !suggestion) return null;
  if (
    status !== 'INSIGHT' &&
    status !== 'SILENT' &&
    status !== 'CONTEXT_MISSING' &&
    status !== 'DATA_CONFLICT'
  ) {
    return { status: 'INSIGHT', summary, suggestion };
  }
  return { status, summary, suggestion };
}

function execOutputToAdvisorCopy(
  output: ExecAdvisorLlmOutput,
  fallbackTitle: string,
): AdvisorCopy {
  return clampAdvisorCopy({
    title: clampChars(fallbackTitle, EXEC_TITLE_MAX),
    body: clampChars(output.summary, EXEC_SUMMARY_MAX),
    advice: clampChars(output.suggestion, EXEC_SUGGESTION_MAX),
  });
}

function parseExecAdvisorJson(raw: string): ExecAdvisorLlmOutput | null {
  const parsed = parseJsonFromLlmText(raw) as Partial<ExecAdvisorLlmOutput> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const status = String(parsed.status ?? 'INSIGHT') as ExecAdvisorStatus;
  const summary = String(parsed.summary ?? '').trim();
  const suggestion = String(parsed.suggestion ?? '').trim();
  if (!summary && !suggestion) return null;
  if (
    status !== 'INSIGHT' &&
    status !== 'SILENT' &&
    status !== 'CONTEXT_MISSING' &&
    status !== 'DATA_CONFLICT'
  ) {
    return { status: 'INSIGHT', summary, suggestion };
  }
  return { status, summary, suggestion };
}
