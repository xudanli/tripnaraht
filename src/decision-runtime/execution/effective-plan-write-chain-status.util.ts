import {
  isEffectivePlanWriteChainEnabled,
  isPlanRepairDraftOnlyEnabled,
} from './effective-plan-write-chain.config';
import {
  isEffectivePlanWriteGuardEnabled,
  isEffectivePlanWriteGuardEnforce,
  isEffectivePlanWriteGuardShadow,
  resolveEffectivePlanWriteGuardMode,
} from './effective-plan-write-guard.config';
import {
  isLegacyMutationWriteGuardActive,
  resolveLegacyMutationWriteGuardMode,
} from './canonical-mutation-commit-guard.config';
import {
  isAgenticMutationGuardForcedByWriteChain,
  resolveAgenticMutationWriteGuardMode,
} from './agentic-tool-side-effect.util';
import { isAgentPlanDraftOnlyEnabled } from './effective-plan-write-chain.config';
import { isPhase6LegacyDeprecationEnabled } from '../phase6-legacy-deprecation.config';
import { isPhase6GatewayDomainRulesExclusive } from '../constraints/constraint-plan-verify.config';
import { getRecentEffectivePlanWriteGuardShadowEvents } from './effective-plan-write-guard-shadow.util';

export interface EffectivePlanWriteChainStatus {
  schemaId: 'tripnara.effective_plan_write_chain@v1';
  writeChainEnabled: boolean;
  planRepairDraftOnly: boolean;
  agentPlanDraftOnly: boolean;
  agenticMutationGuardMode: string;
  agenticMutationGuardForcedByWriteChain: boolean;
  phase6LegacyDeprecation: boolean;
  gatewayDomainRulesExclusive: boolean;
  effectivePlanWriteGuardMode: string;
  legacyMutationGuardMode: string;
  effectivePlanWriteGuardShadowBypassTotal: number;
  authorizedPaths: string[];
  blockedPaths: string[];
}

export function resolveEffectivePlanWriteChainStatus(): EffectivePlanWriteChainStatus {
  return {
    schemaId: 'tripnara.effective_plan_write_chain@v1',
    writeChainEnabled: isEffectivePlanWriteChainEnabled(),
    planRepairDraftOnly: isPlanRepairDraftOnlyEnabled(),
    agentPlanDraftOnly: isAgentPlanDraftOnlyEnabled(),
    agenticMutationGuardMode: resolveAgenticMutationWriteGuardMode(),
    agenticMutationGuardForcedByWriteChain: isAgenticMutationGuardForcedByWriteChain(),
    phase6LegacyDeprecation: isPhase6LegacyDeprecationEnabled(),
    gatewayDomainRulesExclusive: isPhase6GatewayDomainRulesExclusive(),
    effectivePlanWriteGuardMode: resolveEffectivePlanWriteGuardMode(),
    legacyMutationGuardMode: resolveLegacyMutationWriteGuardMode(),
    effectivePlanWriteGuardShadowBypassTotal:
      getRecentEffectivePlanWriteGuardShadowEvents(1).total,
    authorizedPaths: [
      'DecisionCore.finalize → authorize → Rfc001PlanVersionApplyExecutor.execute',
      'POST /trips/:tripId/decision-problems/:problemId/apply (EVALUATE_AUTHORIZE_EXECUTE)',
      'POST /trips/:tripId/decision-problems/:problemId/apply (APPLY_AND_POLL with write authority)',
    ],
    blockedPaths: isEffectivePlanWriteChainEnabled()
      ? [
          'POST /trips/:tripId/feasibility-report/issues/:id/apply-repair (direct)',
          'Planner/Agent direct itinerary mutation without MutationAuthorityEnvelope',
          'PlanningWorkbenchAgent.commitPlan timeline materialization (draft-only when write chain on)',
          'Rfc001ItineraryMaterializer.applyPlanOperations without execute authority',
        ]
      : [],
  };
}
