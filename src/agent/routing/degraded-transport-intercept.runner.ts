/**
 * transport.search 降级 / 区域不一致 → ClarifyEndpoints 拦截（从 ClaudeOrchestrator 迁出）。
 */

import type { DegradedTransportInterceptHost } from './degraded-transport-intercept.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
  TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
} from '../execution/shared/transport-evidence-messages';

export function maybeInterceptDegradedTransportEvidence(
  host: DegradedTransportInterceptHost,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
  startTime: number,
  context: AgentContext,
): OrchestrationResult | undefined {
  const rd = state.research_data as Record<string, any> | undefined;
  if (!rd) return undefined;

  const forceReinject = (state.metadata as any)?.transport_clarify_force_reinject === true;
  const existing = state.clarification_questions ?? [];
  if (!forceReinject && existing.some((q) => q.id === 'clarify_transport_endpoints_v1')) {
    return undefined;
  }
  const baseExisting = forceReinject
    ? existing.filter((q) => q.id !== 'clarify_transport_endpoints_v1')
    : existing;

  const te = rd.transport_evidence as Record<string, any> | undefined;
  const hy = rd.transport_endpoint_hydration as Record<string, any> | undefined;

  const wantsClarify =
    te &&
    te.suggested_action === TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY &&
    (te.degraded === true || te.missing === true);

  const geoOnly =
    !wantsClarify &&
    hy?.geo_context_hint === 'possible_region_mismatch' &&
    (te?.missing === true || te?.degraded === true);

  if (!wantsClarify && !geoOnly) {
    if (forceReinject) {
      (state.metadata as any) = { ...(state.metadata ?? {}), transport_clarify_force_reinject: false };
    }
    return undefined;
  }

  let questionBody =
    typeof te?.user_guidance === 'string' && te.user_guidance.trim()
      ? String(te.user_guidance).trim()
      : TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH;

  if (hy?.geo_context_hint === 'possible_region_mismatch') {
    questionBody +=
      '\n\n【区域一致性】推断的出发点与目的地（例如冰岛行程）在地图上可能相距过远；若非跨国多段行程，请确认出发城市或坐标。';
  }

  state.clarification_questions = [
    ...baseExisting,
    {
      id: 'clarify_transport_endpoints_v1',
      question: questionBody,
      type: 'text',
      required: true,
      hint: '可填写城市名、车站或经纬度（lat,lng）',
      metadata: {
        internal_task: 'ClarifyEndpoints',
        source: 'transport_evidence',
        suggested_action: te?.suggested_action ?? TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
        ...(hy?.geo_context_hint ? { geo_context_hint: hy.geo_context_hint } : {}),
      },
    },
  ];

  state.decision_log.push({
    request_id: state.request_id,
    step: 'RESEARCH',
    actor: 'Orchestrator',
    inputs_summary: 'interceptDegradedTransportEvidence → ClarifyEndpoints',
    outputs_summary: 'RESEARCH_PARTIAL: NEED_USER_CONFIRM (transport)',
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'CLARIFY_ENDPOINTS_INJECT',
      research_partial: true,
      transport_snapshot: {
        degraded: te?.degraded,
        missing: te?.missing,
        suggested_action: te?.suggested_action,
        geo_context_hint: hy?.geo_context_hint,
      },
    },
  });

  state.metadata = {
    ...(state.metadata ?? {}),
    started_at: state.metadata?.started_at ?? new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    total_duration_ms: Date.now() - startTime,
    research_partial: true,
    transport_clarify_force_reinject: false,
  };
  state.current_step = 'RESEARCH';
  host.maybeSnapshot(state, 'CHECKPOINT');
  return host.buildClarificationResult(state, startTime, decisionState, context);
}
