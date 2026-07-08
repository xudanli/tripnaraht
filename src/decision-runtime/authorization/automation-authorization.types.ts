/**
 * AI 自动执行授权中心 — 跨 trip / user 共享类型
 */

import type {
  AutomationPolicy,
  ChangeStrategyProfile,
  TeamGovernancePolicy,
} from '../../trips/trip-constraint-solver/types/travel-decision-contract.types';
import type { AutomationAuthorizationScope } from '../../trips/trip-constraint-solver/types/travel-decision-contract.types';

export const USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID =
  'tripnara.user_automation_authorization_template@v1';

export type { AutomationAuthorizationScope };

export interface UserAutomationAuthorizationTemplate {
  schemaId: typeof USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID;
  updatedAt: string;
  automation?: AutomationPolicy;
  changeStrategy?: ChangeStrategyProfile;
  teamGovernance?: TeamGovernancePolicy;
  automationPaused?: boolean;
}

export interface AutomationAuthorizationSaveInput {
  scope: AutomationAuthorizationScope;
  constraintsVersion?: number;
  automationPaused?: boolean;
  automation?: Partial<AutomationPolicy>;
  changeStrategy?: Partial<ChangeStrategyProfile> & {
    tolerances?: Partial<ChangeStrategyProfile['tolerances']>;
  };
  teamGovernance?: TeamGovernancePolicy;
  /** 恢复 catalog 默认：清空 actionOverrides / executionConditions */
  resetToDefaults?: boolean;
}
