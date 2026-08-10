/**
 * INTAKE / HARD gaps 澄清短路谓词（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';

/** Layer1 行程槽位：先选哪一天，再进入 SKU 错峰场次 */
export function shouldReturnClarificationForItinerarySlotPlacementIntake(
  state: OrchestratorState,
): boolean {
  return (
    (state.metadata as { itinerary_slot_placement_intake_short_circuit?: boolean })
      ?.itinerary_slot_placement_intake_short_circuit === true &&
    Array.isArray(state.clarification_questions) &&
    state.clarification_questions.length > 0
  );
}

/** 旺季极昼错峰：INTAKE 确认卡（体验优化，非合规硬拦） */
export function shouldReturnClarificationForPeakSeasonTimeShiftIntake(
  state: OrchestratorState,
): boolean {
  return (
    (state.metadata as { peak_season_time_shift_intake_short_circuit?: boolean })
      ?.peak_season_time_shift_intake_short_circuit === true &&
    Array.isArray(state.clarification_questions) &&
    state.clarification_questions.length > 0
  );
}

/** F-road + 2WD：INTAKE 结构化合规澄清（优先于马拉松） */
export function shouldReturnClarificationForFroad2wdIntake(state: OrchestratorState): boolean {
  return (
    (state.metadata as { froad_2wd_intake_clarification_short_circuit?: boolean })
      ?.froad_2wd_intake_clarification_short_circuit === true &&
    Array.isArray(state.clarification_questions) &&
    state.clarification_questions.length > 0
  );
}

/** 极昼马拉松 SOFT 下界：INTAKE 返回结构化澄清，禁止进入 RESEARCH/辩论 Raw 泄露 */
export function shouldReturnClarificationForMarathonIntake(state: OrchestratorState): boolean {
  return (
    (state.metadata as { marathon_intake_clarification_short_circuit?: boolean })
      ?.marathon_intake_clarification_short_circuit === true &&
    Array.isArray(state.clarification_questions) &&
    state.clarification_questions.length > 0
  );
}

/** INTAKE 已标 HARD 缺口并生成澄清问题时，不得进入 RESEARCH */
export function shouldReturnClarificationForHardGaps(state: OrchestratorState): boolean {
  const allowPartial = state.metadata?.allow_partial === true;
  if (allowPartial) {
    const hasCompileError =
      state.gaps?.some(
        (g) =>
          g.severity === 'HARD' &&
          (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR'),
      ) ?? false;
    if (
      hasCompileError &&
      state.clarification_questions &&
      state.clarification_questions.length > 0
    ) {
      return true;
    }
    const hasHardDestinationGap =
      state.gaps?.some((g) => g.severity === 'HARD' && g.type === 'MISSING_DESTINATION') ?? false;
    return !!(
      hasHardDestinationGap &&
      state.clarification_questions &&
      state.clarification_questions.length > 0
    );
  }
  const hasHardGaps = state.gaps?.some((g) => g.severity === 'HARD');
  return !!(
    hasHardGaps &&
    state.clarification_questions &&
    state.clarification_questions.length > 0
  );
}
