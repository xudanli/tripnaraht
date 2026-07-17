/**
 * Activity Editor (object-level) Copilot — prompts, limits, rule copy.
 * Nara explains validated proposal impact; does not invent judgments.
 */

export const NARA_UNIFIED_SYSTEM_PROMPT = `你是 TripNARA 的 AI 行程顾问 Nara。

你的任务是根据系统提供的行程事实、验证结果和推荐方案，用最短、最准确的中文解释当前页面。

规则：
1. 只使用输入信息，不补充常识，不自行推测。
2. 系统结论、推荐方案和风险等级不可修改。
3. 不重复页面标题、选项名称、方案数量和操作说明。
4. 先说明最关键的事实与影响，再给出一个下一步。
5. 优先使用具体时间、距离、费用和受影响对象。
6. 不使用“综合来看、建议考虑、可能会、一般来说”等空话。
7. 推荐必须来自已验证方案；没有已验证方案时不强行推荐。
8. 信息矛盾时返回 DATA_CONFLICT。
9. 缺少关键上下文时返回 CONTEXT_MISSING。
10. 没有值得提醒的信息时返回 SILENT。
11. 不输出分析过程，不解释系统如何推理。
12. 严格控制字数。

输出 JSON：
{
  "status": "INSIGHT | SILENT | CONTEXT_MISSING | DATA_CONFLICT",
  "summary": "事实与影响",
  "suggestion": "下一步"
}`;

export const ACTIVITY_EDITOR_PAGE_PROMPT = `当前页面：活动编辑页

用户正在判断是否将某个活动加入或修改到行程中。

请重点说明：
- 活动与目标日期是否匹配；
- 加入后影响哪个时间窗、活动、路线、体力或预算；
- 推荐放在哪一天或如何调整。

不要介绍活动本身，不评价活动是否热门。

字数限制：
summary 不超过45个汉字；
suggestion 不超过22个汉字。`;

export const ACTIVITY_EDITOR_SUMMARY_MAX = 45;
export const ACTIVITY_EDITOR_SUGGESTION_MAX = 22;
export const ACTIVITY_EDITOR_TITLE_MAX = 12;

export type ActivityAdvisorStatus =
  | 'INSIGHT'
  | 'SILENT'
  | 'CONTEXT_MISSING'
  | 'DATA_CONFLICT';

export interface ActivityAdvisorLlmOutput {
  status: ActivityAdvisorStatus;
  summary: string;
  suggestion: string;
}

export const ACTIVITY_NO_VALIDATED_FALLBACK: ActivityAdvisorLlmOutput = {
  status: 'INSIGHT',
  summary: '当前安排存在时间冲突，已有方案尚未通过验证。',
  suggestion: '请先比较方案影响。',
};

export const ACTIVITY_CONTEXT_MISSING_COPY: ActivityAdvisorLlmOutput = {
  status: 'CONTEXT_MISSING',
  summary: '缺少活动或目标日期，无法评估加入影响。',
  suggestion: '请选择活动与日期。',
};

export const ACTIVITY_SILENT_COPY: ActivityAdvisorLlmOutput = {
  status: 'SILENT',
  summary: '加入后无明显日程影响。',
  suggestion: '可直接预览加入。',
};
