/**
 * 将 Agent `research_data.__research_trace_signals` 映射为 `DecisionLogEntry.metadata`（与 PRD / TD-05 对齐）。
 * 与 `src/agent/memory/emotional-resonance/research-member-stability.util.ts` 中 schema 版本保持一致。
 */
import { readExperienceFlowFromResearchData } from '../models/experience-flow.model';
import type { DecisionLogMetadataPrd } from './decision-log-metadata-prd.types';

export const RESEARCH_TRACE_SIGNALS_SCHEMA_V1 = 'research-trace-signals/v1' as const;

const RESEARCH_TRACE_SIGNALS_KEY = '__research_trace_signals';

export type ResearchTraceSignalsLogMetadata = Partial<DecisionLogMetadataPrd>;

/**
 * @param researchData — 通常为 `RoutePlanDraft.researchDataMirror`（Leader 共识快照）
 */
export function mapResearchTraceSignalsToLogMetadata(
  researchData: Record<string, unknown> | undefined | null,
): ResearchTraceSignalsLogMetadata {
  if (!researchData || typeof researchData !== 'object' || Array.isArray(researchData)) {
    return {};
  }
  const raw = researchData[RESEARCH_TRACE_SIGNALS_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const signals = raw as Record<string, unknown>;
  if (signals.schemaVersion !== RESEARCH_TRACE_SIGNALS_SCHEMA_V1) {
    return {};
  }

  const out: ResearchTraceSignalsLogMetadata = {
    stability_mode_active: Boolean(signals.stability_mode_active),
    frustration_circuit_triggered: Boolean(signals.frustration_circuit_triggered),
  };
  if (typeof signals.narrative_track === 'string' && signals.narrative_track.trim()) {
    out.narrative_track = signals.narrative_track as DecisionLogMetadataPrd['narrative_track'];
  }
  if (typeof signals.frustration_threshold === 'number' && Number.isFinite(signals.frustration_threshold)) {
    out._audit_frustration_threshold = signals.frustration_threshold;
  }

  const flow = readExperienceFlowFromResearchData(researchData);
  if (flow) {
    out.experience_flow = {
      tempo: flow.tempo,
      heterogeneityIndex: flow.heterogeneityIndex,
      surpriseBuffer: flow.surpriseBuffer,
      currentFrictionCapacity: flow.currentFrictionCapacity,
      narrativeTone: flow.narrativeTone,
    };
  }

  return out;
}
