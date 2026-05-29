/**
 * 编排步骤 ID → 中文展示（与 `OrchestrationStep` 对齐；未知步骤回传原 ID）。
 * 机器枚举仍在 `step_id` / decision_log.step；此处仅供调试 UI / 中文用户。
 */

const STEP_DISPLAY_ZH: Record<string, string> = {
  INTENT_COMPILE: '意图编译',
  INTAKE: '需求接入',
  STATE_UPDATE: '状态同步',
  RESEARCH: '数据调研',
  POI_SELECTION: '兴趣点选择',
  GATE_EVAL: '门禁评估',
  CONTEXT_BUILD: '上下文构建',
  PLAN_GEN: '方案生成',
  OPTIMIZE: '优化提示',
  VERIFY: '可执行性验证',
  COMPLIANCE: '合规检查',
  REPAIR: '行程修复',
  NARRATE: '决策叙事',
  FEEDBACK: '反馈采集',
  DONE: '已完成',
  FAILED: '失败',
  TIMEOUT: '超时',
  HALLUCINATION_DETECTION: '幻觉检测',
  NEGOTIATE: '权衡协商',
};

export function orchestrationStepDisplayZh(stepId: string): string {
  const k = String(stepId ?? '').trim();
  if (!k) return '';
  return STEP_DISPLAY_ZH[k] ?? k;
}
