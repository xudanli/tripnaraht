/**
 * Injector 侧 ETC 消费审计（挂到 AgentExecutionContext，供 obs / M2 diff）。
 */

export type EffectiveTravelerContextDecisionParamsAuditV1 = {
  schemaId: 'tripnara.etc_decision_params_audit@v1';
  version: 1;
  mode: 'off' | 'shadow' | 'active';
  applied: boolean;
  subjectId: string | null;
  tripId: string | null;
  changedKeys: string[];
  appliedProfileFields: string[];
  l2Fields: string[];
  tripOverridesApplied: string[];
};
