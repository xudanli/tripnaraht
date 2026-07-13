/**
 * User-facing projection for GET execution-risks/{riskId} — mirrors execution-alerts narrative path.
 */

import type {
  ExecutionUserActionDto,
  ExecutionUserNarrativeDto,
} from '../../../mobile/dto/mobile-execution.types';
import { projectActiveRiskToExecutionAlert } from '../../../mobile/utils/active-risk-alert.projection.util';
import type { AttentionPrimarySsoCutoverPlan } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import { resolveRequiredAction } from './execution-alerts-aggregation.util';
import { executionGateToAlertLevel } from './execution-alerts-projection.util';
import {
  enrichAlertWithAttentionPrimaryHeadline,
  findAttentionPrimaryForRisk,
} from './attention-primary-sso-projection.util';
import { enrichAlertWithUserNarrative } from './execution-user-narrative.projection.util';

export type ExecutionRiskDetailProjectionSource =
  | 'execution_risk_center'
  | 'execution_risk_center+attention_primary_sso';

export type ActiveRiskDetailProjection = ActiveRisk & {
  userNarrative?: ExecutionUserNarrativeDto;
  userActions?: ExecutionUserActionDto[];
  projectionSource?: ExecutionRiskDetailProjectionSource;
};

export function projectActiveRiskDetailWithUserFacing(
  risk: ActiveRisk,
  opts?: { cutoverPlan?: AttentionPrimarySsoCutoverPlan | null },
): ActiveRiskDetailProjection {
  const alert = projectActiveRiskToExecutionAlert(risk);
  const level = executionGateToAlertLevel(risk.executionGate, risk.level);
  const requiredAction = resolveRequiredAction(level);

  let enriched = enrichAlertWithUserNarrative(alert, {
    requiredAction,
    sourceRisk: risk,
  });

  const cutoverPlan = opts?.cutoverPlan ?? null;
  if (cutoverPlan) {
    const attentionPrimary = findAttentionPrimaryForRisk(risk, cutoverPlan);
    if (attentionPrimary) {
      enriched = enrichAlertWithAttentionPrimaryHeadline(enriched, attentionPrimary);
    }
  }

  return {
    ...risk,
    userNarrative: enriched.userNarrative,
    userActions: enriched.userActions,
    projectionSource: cutoverPlan
      ? 'execution_risk_center+attention_primary_sso'
      : 'execution_risk_center',
  };
}
