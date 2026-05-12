/**
 * Canonical `failure_reason_codes` for `route_and_run`
 * (`result.payload.evidence_bundle` & `explain.failure_reason_codes`).
 *
 * Product-facing examples and semantics: `docs/api/failure-reason-codes.md`
 */

/** Fallback when `verification_status === FAILED` but no rule fired a specific code (avoid empty FAILED). */
export const VERIFICATION_FAILED_UNSPECIFIED = 'VERIFICATION_FAILED_UNSPECIFIED' as const;

/**
 * 非 Strict 开发态：已有可展示行程，但 Iron Shield 未组装出任何证据卡时，将 bundle 从 FAILED 降级为 PARTIAL 并附此码。
 * 与「真实规则违反」区分：不用于安全/合规类 FAILED。
 */
export const EVIDENCE_MISSING_BUT_RESULTS_PRESENT = 'EVIDENCE_MISSING_BUT_RESULTS_PRESENT' as const;

/** Product-tier codes (extend in doc; backend may also emit domain-specific technical codes). */
export const PRODUCT_FAILURE_REASON_CODES = [
  'TIME_GAP',
  'MISSING_DESTINATION',
  'UNSUPPORTED_CONSTRAINT',
  'SECURITY_RISK',
  'POLICY_VIOLATION',
] as const;

export type ProductFailureReasonCode = (typeof PRODUCT_FAILURE_REASON_CODES)[number];

/** Safety / compliance — highest display priority (same request: before constraint / slot codes). */
const SECURITY_COMPLIANCE = new Set<string>([
  'SECURITY_RISK',
  'POLICY_VIOLATION',
  'DRIVE_SAFETY_VIOLATED',
  'SOLAR_SAFETY_VIOLATED',
  'RAIL_SAFETY_VIOLATED',
  'DRIVE_FORBIDDEN',
]);

/** Rule / feasibility / ops — middle priority. */
const RULE_CONSTRAINT = new Set<string>([
  'UNSUPPORTED_CONSTRAINT',
  'PRECIPITATION_LIMIT_VIOLATED',
  'SNOW_DEPTH_LIMIT_VIOLATED',
  'PT_TRANSFER_GAP_VIOLATION',
  'PT_MISSING_HARD_FACT',
  'PT_CANCELLED',
  'HEAL_IMPACT_TRAVEL_IMPOSSIBLE',
  'HEAL_IMPACT_BOOKING_COLLISION',
  VERIFICATION_FAILED_UNSPECIFIED,
  EVIDENCE_MISSING_BUT_RESULTS_PRESENT,
]);

/** Intake / clarification-style — lower priority than security & rule failures. */
const SLOT_AND_CLARIFICATION = new Set<string>(['TIME_GAP', 'MISSING_DESTINATION']);

/**
 * Sort rank for stable ordering: lower = earlier in the merged list
 * (aligns with frontend: security/compliance before missing-slot style codes).
 */
export function failureReasonCodeSortRank(code: string): number {
  const c = String(code).trim();
  if (!c) return 999;
  if (SECURITY_COMPLIANCE.has(c)) return 10;
  if (RULE_CONSTRAINT.has(c)) return 20;
  if (SLOT_AND_CLARIFICATION.has(c)) return 30;
  return 25;
}

export function sortFailureReasonCodes(codes: readonly string[]): string[] {
  const uniq = Array.from(new Set(codes.map((x) => String(x).trim()).filter(Boolean)));
  uniq.sort((a, b) => {
    const ra = failureReasonCodeSortRank(a);
    const rb = failureReasonCodeSortRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return uniq;
}

/**
 * Map HARD intake gaps to product-oriented codes for `explain.failure_reason_codes`
 * (does not change Iron Shield `verification_status` by itself).
 */
/** 与 `failure_reason_codes` 一一对应的人类可读标签（调试 / 中文 UI）；未知码回传原码。 */
const FAILURE_REASON_LABEL_ZH: Record<string, string> = {
  [EVIDENCE_MISSING_BUT_RESULTS_PRESENT]: '行程已产出，Iron Shield 证据卡待补齐（非 Strict 下降级为部分通过）',
  [VERIFICATION_FAILED_UNSPECIFIED]: '验证未通过（未命中具体规则码）',
  SECURITY_RISK: '安全风险',
  POLICY_VIOLATION: '策略/合规不满足',
  TIME_GAP: '时间窗或日程空隙不足',
  MISSING_DESTINATION: '目的地未确定',
  UNSUPPORTED_CONSTRAINT: '约束无法满足或不支持',
  PT_MISSING_HARD_FACT: '公共交通证据缺失',
  PT_CANCELLED: '公共交通班次取消或服务中断',
  PT_TRANSFER_GAP_VIOLATION: '换乘时间窗口不足',
  DRIVE_SAFETY_VIOLATED: '驾车安全条件不满足',
  DRIVE_FORBIDDEN: '当前禁止驾车路段/模式',
  SOLAR_SAFETY_VIOLATED: '日照/防晒相关安全不满足',
  RAIL_SAFETY_VIOLATED: '铁路线路安全/韧性不满足',
  PRECIPITATION_LIMIT_VIOLATED: '降水限制不满足',
  SNOW_DEPTH_LIMIT_VIOLATED: '积雪深度限制不满足',
  HEAL_IMPACT_TRAVEL_IMPOSSIBLE: '时间线冲突：无法在时限内抵达',
  HEAL_IMPACT_BOOKING_COLLISION: '时间线冲突：与预约/订位冲突',
};

export function failureReasonCodeLabelZh(code: string): string {
  const c = String(code).trim();
  if (!c) return '';
  return FAILURE_REASON_LABEL_ZH[c] ?? c;
}

export function failureReasonCodeLabelsZh(codes: readonly string[]): string[] {
  return codes.map(failureReasonCodeLabelZh);
}

export function failureReasonCodesFromHardGaps(
  gaps: ReadonlyArray<{ type?: string; severity?: string }> | undefined,
): string[] {
  if (!gaps?.length) return [];
  const out: string[] = [];
  for (const g of gaps) {
    if (String(g?.severity) !== 'HARD') continue;
    switch (g.type) {
      case 'MISSING_DESTINATION':
        out.push('MISSING_DESTINATION');
        break;
      case 'MISSING_DATES':
        out.push('TIME_GAP');
        break;
      case 'MISSING_CONSTRAINTS':
      case 'SPEC_TYPE_ERROR':
      case 'INTENT_COMPILE_ERROR':
        out.push('UNSUPPORTED_CONSTRAINT');
        break;
      default:
        break;
    }
  }
  return out;
}
