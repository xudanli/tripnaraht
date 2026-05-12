import type { PolicyBundleSelectionReason } from './policy-selection.types';
import type { RoutePlanningPolicyParameters } from './route-planning-policy-config.types';

/**
 * Policy-as-a-System：版本化策略包 + 声明（数据优先；求值器后续接入）。
 */

export type PolicyDeclarationType = 'SOFT' | 'HARD' | 'OVERRIDE';

export type PolicyDeclarationTarget = 'ROUTE' | 'TRIP' | 'CACHE';

/** 注册表中的策略声明（文档 / 审计 / 未来条件求值） */
export interface PolicyDeclaration {
  id: string;
  type: PolicyDeclarationType;
  target: PolicyDeclarationTarget;
  conditionSummary?: string;
  actionSummary?: string;
}

/** 一条可版本化、可切换的策略包（bundle） */
export interface RoutePlanningPolicyBundle {
  id: string;
  /** 与 parameters.revision 对齐，便于检索 */
  revision: string;
  parameters: RoutePlanningPolicyParameters;
  policyDeclarations?: PolicyDeclaration[];
}

/** Domain Router v1：按上下文选择 bundle（先于 registry 默认项，后于显式 POLICY_ACTIVE_*）。 */
export interface PolicyRouteWhen {
  /** ISO 国家码，大写（匹配时与 context.countryCode 大小写无关） */
  countryCodes?: string[];
  /** tripId 必须以其中任一前缀开头 */
  tripIdPrefixes?: string[];
  /** 为 true 时要求 context 含非空 tripId */
  requireTripId?: boolean;
}

export interface PolicyRouteRule {
  id: string;
  /** 越小越先评估；首条命中即停止 */
  priority: number;
  bundleId: string;
  when: PolicyRouteWhen;
}

export interface PolicyRoutingConfig {
  /** 默认 true（存在 rules 且未设为 false 时启用）；可与 POLICY_ROUTER_DISABLED 联用 */
  enabled?: boolean;
  rules?: PolicyRouteRule[];
}

export interface PolicyRegistryFile {
  bundles: RoutePlanningPolicyBundle[];
  /** Phase 2：ExecutionPlanningContext → policy set */
  routing?: PolicyRoutingConfig;
}

export type { PolicyBundleSelectionReason } from './policy-selection.types';

export interface ResolvedRoutePlanningPolicyBundle {
  bundle: RoutePlanningPolicyBundle;
  /** 命中 domain 规则时的 rule id */
  routingRuleId?: string;
  selectionReason: PolicyBundleSelectionReason;
}
