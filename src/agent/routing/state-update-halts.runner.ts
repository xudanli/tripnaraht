/**
 * STATE_UPDATE 段中止：TERMINAL_NO_SOLUTION / 结构化澄清 / HARD gaps（从 ClaudeOrchestrator 迁出）。
 */

import type { StateUpdateHaltsHost } from './state-update-halts.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { StateUpdatePrePlanSegmentInput } from '../orchestration/graph/nodes/base.node';
import type { GraphRunOutcome } from '../orchestration/graph/orchestration-graph.types';
import { enrichStateForIntakeGuardianDebateShortCircuit } from '../utils/intake-guardian-debate-short-circuit.util';

export async function maybeStateUpdateTerminalNoSolution(
  host: StateUpdateHaltsHost,
  input: StateUpdatePrePlanSegmentInput,
  decisionState: DecisionState | undefined,
): Promise<GraphRunOutcome | null> {
  const terminalIntent = (input.state.metadata as { terminal_intent?: string })?.terminal_intent;
  if (terminalIntent !== 'TERMINAL_NO_SOLUTION') return null;
  host.logger.warn(
    `[Claude Orchestrator] TERMINAL_NO_SOLUTION confirmed by user; halting orchestration.`,
  );
  input.state.current_step = 'DONE';
  input.state.verdict = 'REJECT';
  input.state.metadata.last_updated_at = new Date().toISOString();
  input.state.metadata.total_duration_ms = Date.now() - input.prePlan.startTime;
  host.maybeSnapshot(input.state, 'CHECKPOINT');
  return input.prePlan.prePlanTerminal(
    'terminal_no_solution',
    host.buildTerminalNoSolutionResult(
      input.state,
      input.prePlan.startTime,
      decisionState,
      input.context,
    ),
  );
}

export async function maybeStateUpdateStructuredIntakeClarification(
  host: StateUpdateHaltsHost,
  input: StateUpdatePrePlanSegmentInput,
  decisionState: DecisionState | undefined,
): Promise<GraphRunOutcome | null> {
  const marathon = host.shouldReturnClarificationForMarathonIntake(input.state);
  const froad2wd = host.shouldReturnClarificationForFroad2wdIntake(input.state);
  const peakSeason = host.shouldReturnClarificationForPeakSeasonTimeShiftIntake(input.state);
  const slotPlacement = host.shouldReturnClarificationForItinerarySlotPlacementIntake(input.state);
  if (!marathon && !froad2wd && !peakSeason && !slotPlacement) {
    return null;
  }

  if (marathon || froad2wd || peakSeason) {
    enrichStateForIntakeGuardianDebateShortCircuit(input.state, input.request);
  }

  const shortCircuitKind = marathon
    ? 'marathon'
    : froad2wd
      ? 'froad_2wd'
      : peakSeason
        ? 'peak_season_time_shift'
        : 'slot_placement';

  input.state.decision_log.push({
    request_id: input.state.request_id,
    step: 'STATE_UPDATE',
    actor: 'Orchestrator',
    inputs_summary: 'INTAKE structured clarification → guardian debate surface',
    outputs_summary: `kind=${shortCircuitKind} gate=${input.state.gate_result?.gate_result ?? 'n/a'} personas=${Boolean(input.state.gate_result?.guardian_results)}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'INTAKE_GUARDIAN_DEBATE_SHORT_CIRCUIT',
      intake_short_circuit_kind: shortCircuitKind,
      marathon_intake:
        (input.state.metadata as Record<string, unknown>)?.marathon_intake_clarification_short_circuit ===
        true,
      debate_gate_fusion: (input.state.metadata as Record<string, unknown>)?.debate_gate_fusion,
    },
  });

  host.logger.log(
    `[Claude Orchestrator] INTAKE 结构化澄清短路 kind=${shortCircuitKind}，跳过 RESEARCH/Gate/Plan`,
  );
  return input.prePlan.prePlanTerminal(
    'terminal_clarification',
    host.buildClarificationResult(
      input.state,
      input.prePlan.startTime,
      decisionState,
      input.context,
    ),
  );
}

export async function maybeStateUpdateHardGapsClarification(
  host: StateUpdateHaltsHost,
  input: StateUpdatePrePlanSegmentInput,
  decisionState: DecisionState | undefined,
): Promise<GraphRunOutcome | null> {
  if (!host.shouldReturnClarificationForHardGaps(input.state)) return null;
  const compileHard =
    input.state.gaps?.find(
      (g) =>
        g?.severity === 'HARD' &&
        (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR'),
    ) ?? null;
  if (compileHard) {
    input.state.decision_log.push({
      request_id: input.state.request_id,
      step: 'INTAKE',
      actor: 'Orchestrator',
      inputs_summary: 'INTAKE compiler hard error → clarification',
      outputs_summary: `INTENT_COMPILE_BLOCK: ${compileHard.type}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'INTENT_COMPILE_BLOCK',
        gap_type: compileHard.type,
        detail: compileHard.detail,
        allow_partial: input.state.metadata?.allow_partial === true,
      },
    });
  }
  host.logger.debug(
    `[Claude Orchestrator] HARD 缺口且已有澄清问题，跳过 RESEARCH/Gate/Plan，直接返回澄清`,
  );
  return input.prePlan.prePlanTerminal(
    'terminal_clarification',
    host.buildClarificationResult(
      input.state,
      input.prePlan.startTime,
      decisionState,
      input.context,
    ),
  );
}
