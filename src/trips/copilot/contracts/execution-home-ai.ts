/**
 * Execution Home (real-time) Copilot — prompts, limits, rule copy.
 * Priority: safety → executability → time window → must confirm → never experience optimization.
 */

import { NARA_UNIFIED_SYSTEM_PROMPT } from './activity-editor-ai';

export { NARA_UNIFIED_SYSTEM_PROMPT };

export const EXECUTION_HOME_PAGE_PROMPT = `当前页面：执行首页

用户需要知道现在还能否按计划继续，以及最晚何时必须行动。

请重点说明：
- 当前实际状态与计划的偏差；
- 最近将受到影响的活动或风险；
- 用户现在是否需要知晓、确认或调整。

优先级：
安全 > 可执行性 > 时间窗 > 必须确认 > 一般优化。

不要推荐与当前执行无关的体验优化。

字数限制：
summary 不超过45个汉字；
suggestion 不超过22个汉字。`;

export const EXEC_SUMMARY_MAX = 45;
export const EXEC_SUGGESTION_MAX = 22;
export const EXEC_TITLE_MAX = 12;

export type ExecAdvisorStatus =
  | 'INSIGHT'
  | 'SILENT'
  | 'CONTEXT_MISSING'
  | 'DATA_CONFLICT';

export interface ExecAdvisorLlmOutput {
  status: ExecAdvisorStatus;
  summary: string;
  suggestion: string;
}

export const EXEC_CONTEXT_MISSING_COPY: ExecAdvisorLlmOutput = {
  status: 'CONTEXT_MISSING',
  summary: '缺少行中状态，无法判断是否还能按计划走。',
  suggestion: '请确认行程已开始出行。',
};

export const EXEC_SILENT_COPY: ExecAdvisorLlmOutput = {
  status: 'SILENT',
  summary: '当前进度正常，可按计划继续。',
  suggestion: '继续关注下一站即可。',
};

export const EXEC_NO_VALIDATED_FALLBACK: ExecAdvisorLlmOutput = {
  status: 'INSIGHT',
  summary: '当前安排存在执行风险，修复方案尚未就绪。',
  suggestion: '请先查看风险详情。',
};

/** Soft delay threshold (minutes) before ATTENTION without other risks. */
export const EXEC_DELAY_ATTENTION_MINUTES = 15;
/** Hard delay threshold for INTERVENTION when next window at risk. */
export const EXEC_DELAY_INTERVENTION_MINUTES = 30;
