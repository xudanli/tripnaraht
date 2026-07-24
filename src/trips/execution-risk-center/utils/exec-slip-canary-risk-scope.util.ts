/**
 * Exec Slip Canary — suppress unrelated knowledge-package derivations (e.g. SH-ENV-005 volcanic).
 */

import { ATTENTION_SHADOW_CANARY_TRIP_ID } from '../../guardian-decision-core/attention/attention-shadow-staging-replay-catalog';
import type { ActiveRisk } from '../types/execution-risk.types';
import { isKnowledgePackageNoiseRisk } from './execution-alert-knowledge-noise.util';

export function isExecSlipCanaryTrip(tripId: string): boolean {
  return tripId === ATTENTION_SHADOW_CANARY_TRIP_ID;
}

/** Keep only risks in scope for Exec Slip drill (wind/slip/infeasible + explicit decision problems). */
export function isExecSlipCanaryInScopeRisk(risk: ActiveRisk): boolean {
  if (risk.decisionProblemIds.some((id) => isExecSlipAllowedProblemId(id))) {
    return true;
  }

  if (risk.sourceRefs.some((ref) => isExecSlipAllowedProblemId(ref.sourceId))) {
    return true;
  }

  if (isKnowledgePackageNoiseRisk(risk)) {
    return false;
  }

  return true;
}

export function filterExecSlipCanaryRisks(risks: ActiveRisk[], tripId: string): ActiveRisk[] {
  if (!isExecSlipCanaryTrip(tripId)) return risks;
  return risks.filter(isExecSlipCanaryInScopeRisk);
}

function isExecSlipAllowedProblemId(id: string): boolean {
  return (
    id.startsWith('stg_attn_') ||
    id.startsWith('dp_id:') ||
    id.startsWith('dp_anchor:') ||
    id.startsWith('intervention-tep-')
  );
}
