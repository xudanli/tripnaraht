/**
 * RFC-002 Phase 1 feature flags.
 * Phase 3 收尾：unified API 默认开启；仅显式 DECISION_GATEWAY_UNIFIED=0 关闭（SSOT 开启时不可关）。
 */

function isDecisionProblemSsotStoreEnvOn(): boolean {
  const v = process.env.DECISION_PROBLEM_SSOT_STORE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isDecisionGatewayUnifiedEnabled(): boolean {
  const v = process.env.DECISION_GATEWAY_UNIFIED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') {
    // Phase 3b — SSOT on时 unified API 不可关闭
    if (isDecisionProblemSsotStoreEnvOn()) return true;
    return false;
  }
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (isDecisionProblemSsotStoreEnvOn()) return true;
  // Phase 3 收尾：未设置时默认 unified ON
  return true;
}
