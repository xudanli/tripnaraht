/**
 * 轻量团队通知：变更写入后生成 notify 载荷（Phase 7）。
 * 实际推送由渠道 / 既有 notify 动作执行；此处只产出统一卡字段。
 */

export type TeamNotifyLoopInput = {
  trip_id: string;
  member_ids: string[];
  change_summary_zh: string;
  affected_dates_iso?: string[];
  plan_version_to?: number | null;
};

export type TeamNotifyLoopResult = {
  notify_member_ids: string[];
  notify_summary_zh: string;
  /** 供 apply_receipt / team_action 使用 */
  notified_member_ids: string[];
};

export function buildTeamNotifyAfterApply(
  input: TeamNotifyLoopInput,
): TeamNotifyLoopResult | null {
  const ids = [...new Set(input.member_ids.map(String).filter(Boolean))];
  if (!ids.length) return null;

  const dates =
    input.affected_dates_iso?.filter(Boolean).join('、') || '相关日期';
  const ver =
    input.plan_version_to != null ? `（计划 v${input.plan_version_to}）` : '';

  return {
    notify_member_ids: ids,
    notified_member_ids: ids,
    notify_summary_zh: `行程已更新${ver}：${input.change_summary_zh}。影响：${dates}。将通知 ${ids.length} 位成员。`,
  };
}
