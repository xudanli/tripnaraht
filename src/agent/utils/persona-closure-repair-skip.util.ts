import type { PersonaClosureAudit } from '../../trips/decision/shared/persona-closure.types';
import type { GateResult } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { RepairTrace } from '../services/route-feasibility.types';

export const PERSONA_CLOSURE_SKIP_REASON = 'persona_closure_already_converged' as const;

export function mergePersonaClosureAuditIntoOrchestrator(
  state: Pick<OrchestratorState, 'metadata' | 'gate_result'>,
  audit: PersonaClosureAudit | undefined,
): void {
  if (!audit) return;
  state.metadata = {
    ...(state.metadata ?? { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() }),
    persona_closure_audit: audit,
  };
  if (state.gate_result) {
    state.gate_result = {
      ...state.gate_result,
      persona_closure_audit: audit,
    };
  }
}

export function resolvePersonaClosureAudit(input: {
  personaClosureAudit?: PersonaClosureAudit;
  gateResult?: GateResult | PhaseExecutorContext['gateResult'];
  orchestratorMetadata?: Record<string, unknown>;
  systemState?: DecisionState['systemState'];
}): PersonaClosureAudit | undefined {
  return (
    input.personaClosureAudit ??
    (input.gateResult as GateResult | undefined)?.persona_closure_audit ??
    (input.orchestratorMetadata?.persona_closure_audit as PersonaClosureAudit | undefined) ??
    input.systemState?.personaClosureAudit
  );
}

export function verificationHasFatal(dso: Pick<DecisionState, 'verification'>): boolean {
  if (dso.verification?.hasFatal === true) return true;
  return (dso.verification?.issues ?? []).some((i) => i.class === 'FATAL');
}

/** Neptune REPLACE 已在 StrategyOrchestrator 闭环且 Abu 重验通过 → 可跳过 REPAIR 内重复空间替换 */
export function shouldSkipRepairNeptuneReplace(
  audit: PersonaClosureAudit | undefined,
  dso: Pick<DecisionState, 'verification'>,
): boolean {
  if (!audit || audit.stopReason !== 'ABU_RECHECK_PASS') return false;
  if (verificationHasFatal(dso)) return false;
  return true;
}

const SPATIAL_REPLACE_ACTIONS = new Set(['REPLACE_SEGMENT', 'REPLACE_POI']);

export function filterSpatialReplaceAdjustments<T extends { action: string }>(
  adjustments: T[] | undefined,
  skip: boolean,
): T[] {
  if (!skip || !adjustments?.length) return adjustments ?? [];
  return adjustments.filter((a) => !SPATIAL_REPLACE_ACTIONS.has(String(a.action)));
}

export function buildPersonaClosureSkipRepairTrace(): RepairTrace {
  return {
    tacticId: 'PersonaClosureConvergedSkip',
    targetEntity: { type: 'OTHER', id: 'neptune_spatial_replace' },
    applied: false,
    metrics: {
      fatigue_weight: 0,
      base_limit: 0,
      effective_limit: 0,
      actual_cost: 0,
      unit: 'skip',
    },
    reason: 'SUCCESS_APPLIED',
    evidence: { refIds: [PERSONA_CLOSURE_SKIP_REASON] },
  };
}
