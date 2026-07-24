/**
 * Planning Overview (trip-level) Copilot — prompts, limits, rule copy.
 * Navigation / prioritization only — never SELECT_OPTION / APPLY_CASE_OPTION.
 */

import { NARA_UNIFIED_SYSTEM_PROMPT } from './activity-editor-ai';

export { NARA_UNIFIED_SYSTEM_PROMPT };

export const PLANNING_OVERVIEW_PAGE_PROMPT = `当前页面：规划概览页

用户需要知道整个行程当前完成到什么程度，以及下一步先处理什么。

请重点说明：
- 当前行程最关键的未完成项；
- 它会阻塞或影响什么；
- 最优先处理的一件事。

不要展开单个决策的方案细节，不随机挑选普通问题。

字数限制：
summary 不超过55个汉字；
suggestion 不超过24个汉字。`;

export const OVERVIEW_SUMMARY_MAX = 55;
export const OVERVIEW_SUGGESTION_MAX = 24;
export const OVERVIEW_TITLE_MAX = 12;

export type OverviewAdvisorStatus =
  | 'INSIGHT'
  | 'SILENT'
  | 'CONTEXT_MISSING'
  | 'DATA_CONFLICT';

export interface OverviewAdvisorLlmOutput {
  status: OverviewAdvisorStatus;
  summary: string;
  suggestion: string;
}

export const OVERVIEW_CONTEXT_MISSING_COPY: OverviewAdvisorLlmOutput = {
  status: 'CONTEXT_MISSING',
  summary: '缺少行程级准备度或决策队列，无法总结。',
  suggestion: '请刷新行程后再试。',
};

export const OVERVIEW_SILENT_COPY: OverviewAdvisorLlmOutput = {
  status: 'SILENT',
  summary: '当前无阻塞项，行程规划可继续。',
  suggestion: '可查看准备度详情。',
};

export const OVERVIEW_NO_PRIORITY_FALLBACK: OverviewAdvisorLlmOutput = {
  status: 'INSIGHT',
  summary: '行程仍有待处理事项，优先项尚未对齐。',
  suggestion: '先打开决策队列。',
};
