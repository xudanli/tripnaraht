/**
 * NARRATE 接线：将 planning_phase_intent 的供应链前缀与双轨摘要注入用户可读叙述。
 */

import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { PlanningIntentPayload } from './planning-intent-processor.util';

export function mergePlanningPhaseIntentIntoNarration(
  narration: NarrationLike,
  state: OrchestratorState,
): NarrationLike {
  const payload = (state.metadata as Record<string, unknown> | undefined)
    ?.planning_phase_intent as PlanningIntentPayload | undefined;
  if (!payload) return narration;

  let tips = [...(narration.tips ?? [])];
  let warnings = [...(narration.warnings ?? [])];
  let summary = narration.user_friendly_summary ?? '';

  const safety = payload.supply_chain_safety;
  if (safety?.processedResponsePrefix?.trim()) {
    const prefix = safety.processedResponsePrefix.trim();
    if (!safety.safeToPromise) {
      if (!warnings.some((w) => typeof w === 'string' && w.includes('供应链安全警告'))) {
        warnings = [prefix, ...warnings];
      }
      if (!tips.some((t) => t.includes('Gate 约束'))) {
        tips.unshift(
          '[规划期·供应链] 系统不会在无 L3 实时数据时做出绝对承诺；已改为 Gate 约束与补给锚点建议。',
        );
      }
    } else if (payload.sub_signals.supply_chain_verification_requested) {
      if (!tips.some((t) => t.includes('Evidence Level'))) {
        tips.unshift(prefix);
      }
    }
  }

  if (
    payload.sub_signals.scenario_planning_requested &&
    (payload.contingency_branches?.length ?? 0) > 0
  ) {
    const branchLine =
      `[规划期·双轨预案] 已为 ${payload.contingency_branches!.length} 个路段/日程种子化 contingency 分支；` +
      `遇 CRITICAL_DISRUPTION 时将激活 Plan B 绕行路由（期望残存效用比约 ${payload.contingency_branches![0]?.expected_utility_ratio ?? 0.85}）。`;
    if (!tips.some((t) => t.includes('双轨预案'))) {
      tips.unshift(branchLine);
    }
    if (!summary.includes('双轨')) {
      const dualTrackHint = '已纳入晴/雨双轨拓扑预演约束。';
      summary = summary ? `${summary} ${dualTrackHint}` : dualTrackHint;
    }
  }

  const spatial = payload.spatial_intent;
  if (payload.sub_signals.spatial_intent_capture_requested && spatial) {
    if (spatial.feasible) {
      const okLine =
        `[规划期·空间锚点] Day ${spatial.target_day_number ?? '?'} 插入 ${spatial.anchor_label ?? '非标锚点'} ` +
        `时空预检通过（预计额外车程约 ${spatial.extra_drive_minutes_estimate ?? 20} 分钟）。`;
      if (!tips.some((t) => t.includes('空间锚点'))) {
        tips.unshift(okLine);
      }
    } else {
      const blockLine =
        `[规划期·空间冲突] Day ${spatial.target_day_number ?? '?'} 插入不可行：` +
        `${spatial.conflicts.map((c) => c.message_zh).join(' ')}` +
        (spatial.suggested_day_number
          ? ` 建议改插 Day ${spatial.suggested_day_number}。`
          : '');
      if (!warnings.some((w) => typeof w === 'string' && w.includes('空间冲突'))) {
        warnings.unshift(blockLine);
      }
    }
  }

  if (tips.length === (narration.tips ?? []).length && warnings.length === (narration.warnings ?? []).length && summary === (narration.user_friendly_summary ?? '')) {
    return narration;
  }

  return {
    ...narration,
    tips,
    warnings,
    user_friendly_summary: summary,
  };
}
