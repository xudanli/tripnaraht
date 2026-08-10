/**
 * Phase B: Conductor 只调 Kernel - 执行阶段并原子同步（从 ClaudeOrchestrator 迁出）。
 */

import type { ExecutePhaseViaKernelHost } from './execute-phase-via-kernel.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { projectToOrchestratorState } from '../../decision/kernel/dso-authority.util';
import type { OrchestrationStep, OrchestratorState, SubAgentType } from '../interfaces/trip-plan.interface';
import { emitPhaseExecutionPath } from '../orchestration/phase-execution-path.telemetry.util';

export async function executePhaseViaKernel(
  host: ExecutePhaseViaKernelHost,
  decisionState: DecisionState | undefined,
  state: OrchestratorState,
  phaseName: string,
  executeFn: () => Promise<void>,
): Promise<DecisionState | undefined> {
  if (!host.decisionKernel || !decisionState) {
    emitPhaseExecutionPath(state, {
      phase: phaseName,
      path: !host.decisionKernel ? 'kernel_missing_service' : 'kernel_missing_dso',
      reason: !host.decisionKernel ? 'missing_kernel' : 'missing_dso',
      step: phaseName as OrchestrationStep,
      loggerWarn: (m) => host.logger.warn(m),
    });
    await executeFn();
    return (await host.executeStateUpdateStep(state, decisionState)) ?? decisionState;
  }
  const stepStartTime = Date.now();
  const updated = await host.decisionKernel.executePhase(
    decisionState,
    state,
    phaseName,
    executeFn,
  );
  projectToOrchestratorState(updated, state, { phase: phaseName });
  state.decision_log.push({
    request_id: state.request_id,
    step: 'STATE_UPDATE' as OrchestrationStep,
    actor: 'Orchestrator' as SubAgentType,
    inputs_summary: `步骤「${phaseName}」完成后，将内存状态写回决策存储`,
    outputs_summary: `决策状态已同步，版本号 ${updated.systemState?.version ?? '?'}。`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: { duration_ms: Date.now() - stepStartTime },
  });
  state.metadata.last_updated_at = new Date().toISOString();
  return updated;
}
