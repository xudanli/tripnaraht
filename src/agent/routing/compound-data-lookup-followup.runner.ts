/**
 * 复合意图：CRUD 已落库后，用轻量 DATA_LOOKUP 回答同句咨询子句（从 ClaudeOrchestrator 迁出）。
 */

import type { CompoundDataLookupFollowupHost } from './compound-data-lookup-followup.host';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export async function mergeCompoundDataLookupFollowup(
  host: CompoundDataLookupFollowupHost,
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  llmProvider: LlmProvider,
): Promise<void> {
  const followup = (state.metadata as Record<string, unknown>)?.compound_data_lookup_followup;
  const followupText = typeof followup === 'string' ? followup.trim() : '';
  if (!followupText) return;

  const crudAnswer = String(state.narration?.user_friendly_summary ?? '').trim();
  try {
    const lw = await host.orchestrateLightweightKnowledgeQuery(
      { ...request, message: followupText },
      context,
      undefined,
      llmProvider,
      Date.now(),
    );
    const extra = String(lw.answerText ?? '').trim();
    if (!extra) return;
    state.narration = {
      user_friendly_summary: crudAnswer ? `${crudAnswer}\n\n${extra}` : extra,
      day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
      highlights: state.narration?.highlights ?? [],
      tips: state.narration?.tips ?? [],
      day_by_day_text_zh: state.narration?.day_by_day_text_zh,
      warnings: state.narration?.warnings,
      research_ui_hints: state.narration?.research_ui_hints,
      voice_tone_modifier: state.narration?.voice_tone_modifier,
      visual_hint: state.narration?.visual_hint,
      audio_prosody: state.narration?.audio_prosody,
    };
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] compound DATA_LOOKUP followup failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
