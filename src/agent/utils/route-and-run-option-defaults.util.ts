import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

/** 是否在 API 响应中附带 `explain.simplified_explanation`（前端「结构化说明」面板）。 */
export function shouldExposeSimplifiedExplanationForClient(
  options?: RouteAndRunRequestDto['options'],
): boolean {
  return options?.show_debug_scores === true;
}

/**
 * 状态机（TRIP_PLANNING）入口默认开启三人格 LLM 合议。
 * 显式 `enable_guardians_debate_llm: false` 仍可关闭。
 */
export function applyTripPlanningStateMachineOptionDefaults(request: RouteAndRunRequestDto): void {
  if (!request.options) {
    request.options = {};
  }
  if (request.options.enable_guardians_debate_llm === undefined) {
    request.options.enable_guardians_debate_llm = true;
  }
}
