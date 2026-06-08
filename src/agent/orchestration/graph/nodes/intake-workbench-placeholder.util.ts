import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { isWorkbenchAssistantPlaceholderMessage } from '../../../utils/trip-plan-intake-message.util';
import { stripSystemMessageBlocksForIntakeNl } from '../../../utils/trip-plan-intake-vehicle.util';

export type WorkbenchPlaceholderShortCircuitResult = {
  applied: boolean;
  answerText?: string;
};

export function buildWorkbenchPlaceholderWelcomeText(state: OrchestratorState): string {
  const destRaw = state.trip_plan_request?.destination;
  const dest =
    typeof destRaw === 'string' && destRaw.trim() && destRaw !== '未指定'
      ? destRaw.trim()
      : '当前';
  const start =
    state.trip_plan_request?.date_range?.start_date ?? state.trip_plan_request?.start_date;
  const end = state.trip_plan_request?.date_range?.end_date;
  const datePart =
    start && end ? `（${start} 至 ${end}）` : start ? `（${start} 起）` : '';
  return `我已关联您的${dest}行程${datePart}。请直接提问，例如：查攻略、检查日程是否合理、为第二天推荐酒店等。`;
}

export function applyWorkbenchPlaceholderShortCircuitIfRequested(params: {
  message?: string | null;
  tripId?: string | null;
  state: OrchestratorState;
}): boolean {
  const tripId = params.tripId?.trim();
  if (!tripId) return false;

  const nl = stripSystemMessageBlocksForIntakeNl(String(params.message ?? ''));
  if (!isWorkbenchAssistantPlaceholderMessage(nl)) return false;

  const answerText = buildWorkbenchPlaceholderWelcomeText(params.state);
  (params.state.metadata as Record<string, unknown>).workbench_assistant_placeholder_short_circuit = {
    applied: true,
    answerText,
  } satisfies WorkbenchPlaceholderShortCircuitResult;
  (params.state.metadata as Record<string, unknown>).workbench_assistant_placeholder_intake = true;

  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  params.state.verdict = 'ALLOW';
  params.state.current_step = 'DONE';
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: answerText,
    day_by_day_narrative: prior?.day_by_day_narrative ?? [],
    highlights: prior?.highlights ?? [],
    tips: prior?.tips ?? [],
    day_by_day_text_zh: prior?.day_by_day_text_zh,
    warnings: prior?.warnings,
    research_ui_hints: prior?.research_ui_hints,
    voice_tone_modifier: prior?.voice_tone_modifier,
    visual_hint: prior?.visual_hint,
    audio_prosody: prior?.audio_prosody,
  };
  return true;
}

export function shouldTerminalAfterWorkbenchPlaceholder(state: OrchestratorState): boolean {
  const sc = (state.metadata as Record<string, unknown>)
    ?.workbench_assistant_placeholder_short_circuit as WorkbenchPlaceholderShortCircuitResult | undefined;
  return sc?.applied === true && Boolean(sc.answerText?.trim());
}

export function getWorkbenchPlaceholderAnswerText(state: OrchestratorState): string | undefined {
  const sc = (state.metadata as Record<string, unknown>)
    ?.workbench_assistant_placeholder_short_circuit as WorkbenchPlaceholderShortCircuitResult | undefined;
  return sc?.answerText?.trim() || undefined;
}
