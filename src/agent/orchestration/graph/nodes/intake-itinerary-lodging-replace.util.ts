/**
 * INTAKE：住宿从 A→B 替换短路（可在 ITINERARY_ADJUST 下执行，避免进全量走廊重规划）。
 */

import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';
import { detectLodgingReplaceIntent } from '../../../utils/itinerary-lodging-replace.util';

export type LodgingReplaceApplyResult = {
  applied: boolean;
  answerText?: string;
  checkInIso?: string;
  fromName?: string;
  toName?: string;
  reason?: string;
  skillsHit?: string[];
};

export type LodgingReplaceIntakeHost = {
  tryApplyBoundTripLodgingReplace?(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<LodgingReplaceApplyResult>;
};

export async function applyLodgingReplaceIfRequested(
  host: LodgingReplaceIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
    dateRange?: { start_date?: string; end_date?: string };
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  if (!detectLodgingReplaceIntent(intakeMsg)) return false;

  const tripId = params.tripId?.trim();
  if (!tripId || !host.tryApplyBoundTripLodgingReplace) return false;

  const result = await host.tryApplyBoundTripLodgingReplace(
    tripId,
    params.userId,
    intakeMsg,
    params.dateRange,
  );
  (params.state.metadata as Record<string, unknown>).lodging_replace_short_circuit = result;

  if (!result.answerText && !result.applied) return false;

  (params.state.metadata as Record<string, unknown>).lodging_replace_intake = true;
  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  // 勿沿用旧 NARRATE 按日叙述 / 改排草案元数据，避免前端挂英文占位与「草案待确认」
  delete (params.state.metadata as Record<string, unknown>).itinerary_adjust_intake;
  delete (params.state.metadata as Record<string, unknown>).itinerary_adjust_result;
  delete (params.state.metadata as Record<string, unknown>).pending_itinerary_adjust_draft;
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: result.answerText ?? '',
    day_by_day_narrative: [],
    highlights: prior?.highlights ?? [],
    tips: prior?.tips ?? [],
    day_by_day_text_zh: undefined,
    warnings: prior?.warnings,
    research_ui_hints: undefined,
    voice_tone_modifier: prior?.voice_tone_modifier,
    visual_hint: prior?.visual_hint,
    audio_prosody: prior?.audio_prosody,
  };
  // 处理记录：把先前 ITINERARY_ADJUST 分类行改成用户可读的住宿替换说明
  for (const entry of params.state.decision_log ?? []) {
    const out = String(entry.outputs_summary ?? '');
    const sys = (entry.metadata as Record<string, unknown> | undefined)?.system_action;
    if (
      sys === 'ITINERARY_ADJUST_CLASSIFIED' ||
      /ITINERARY_ADJUST|探索\/商量意图|全周编排仅重算/.test(out)
    ) {
      entry.inputs_summary = '识别为修改某一晚住宿的请求';
      entry.outputs_summary = result.applied
        ? `已按您的要求替换住宿${result.checkInIso ? `（${result.checkInIso}）` : ''}。`
        : '未能完成住宿替换，请确认该日行程后重试。';
      entry.metadata = {
        ...(entry.metadata ?? {}),
        system_action: 'LODGING_REPLACE_CLASSIFIED',
      };
    }
  }
  params.state.decision_log.push({
    request_id: params.state.request_id,
    step: result.applied ? 'REPAIR' : 'INTAKE',
    actor: 'LocalInsight',
    inputs_summary: `用户住宿替换意图: ${intakeMsg.slice(0, 200)}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      result.answerText ?? '住宿替换',
      result.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(result.skillsHit, {
      system_action: result.applied ? 'LODGING_REPLACE_APPLIED' : 'LODGING_REPLACE_ADVICE',
      lodging_replace_reason: result.reason,
      check_in: result.checkInIso,
      from_name: result.fromName,
      to_name: result.toName,
    }),
  });
  return true;
}

export function shouldTerminalAfterLodgingReplace(state: OrchestratorState): boolean {
  const sc = (state.metadata as Record<string, unknown>)?.lodging_replace_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return sc?.applied === true || Boolean(sc?.answerText);
}
