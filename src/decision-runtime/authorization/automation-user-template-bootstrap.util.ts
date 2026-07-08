/**
 * 新建行程时，若用户已保存「全部我的行程」模板，则写入 travelDecisionContract。
 */

import type { UserAutomationAuthorizationTemplate } from './automation-authorization.types';
import {
  mergeStoredTravelDecisionContract,
  readStoredTravelDecisionContract,
} from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';

export function bootstrapTripMetadataWithUserAutomationTemplate(
  metadata: Record<string, unknown>,
  template: UserAutomationAuthorizationTemplate | undefined,
): Record<string, unknown> {
  if (!template) return metadata;

  const existing = readStoredTravelDecisionContract(metadata);
  if (existing?.automationScope === 'TRIP' && existing.automation?.actionOverrides) {
    return metadata;
  }

  const contract = mergeStoredTravelDecisionContract(existing, {
    automationScope: 'USER_TEMPLATE',
    automationPaused: template.automationPaused,
    automation: template.automation,
    changeStrategy: template.changeStrategy,
    teamGovernance: template.teamGovernance,
  });

  return {
    ...metadata,
    travelDecisionContract: contract,
  };
}
