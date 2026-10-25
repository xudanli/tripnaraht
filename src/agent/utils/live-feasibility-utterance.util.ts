/**
 * Live / Safety Feasibility 话术检测（跨层共用）。
 * System1 TaskFrame / AgentTaskContract / UnifiedIntent 必须同一口径，
 * 避免「还能走 F208」在一层是 FEASIBILITY、在合同层却是 TRIP_QUERY。
 *
 * 注意：单独提到 F-road / 高地 不等于可行性问句
 * （如「租两驱还是四驱？可能要走高地 F-road」仍是 Decision Support）。
 */

const LIVE_FEASIBILITY_ACT_RE =
  /还能去|还能走|还能开|还能通|来得及|晚了|晚点|延误|现在还能|今天继续还是|返回酒店|会不会赶不上|还能不能去|安全吗|能走吗|通行吗/i;

const LIVE_FEASIBILITY_ROUTE_HINT_RE = /F208|F-road|F路/i;

const LIVE_FEASIBILITY_ROUTE_ACT_RE = /还能|安全|通行|能走|可行|封路|关闭|开得了|走得了/i;

/** 兼容旧引用：动作类可行性话术 */
export const LIVE_FEASIBILITY_UTTERANCE_RE = LIVE_FEASIBILITY_ACT_RE;

export function isLiveFeasibilityUtterance(message: string): boolean {
  const m = String(message ?? '');
  if (LIVE_FEASIBILITY_ACT_RE.test(m)) return true;
  if (
    LIVE_FEASIBILITY_ROUTE_HINT_RE.test(m) &&
    LIVE_FEASIBILITY_ROUTE_ACT_RE.test(m)
  ) {
    return true;
  }
  return false;
}
