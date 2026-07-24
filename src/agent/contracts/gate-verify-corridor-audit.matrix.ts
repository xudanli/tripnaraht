/**
 * P1-3：分走廊 Gate / VERIFY 绕过审计矩阵。
 *
 * 收窄结论：route_and_run 主链 GATE BLOCK 不可进入 PLAN_GEN；
 * 各 Apply 走廊是否复用同一 GATE_EVAL 需分项审计，禁止宣称「全系统无绕过」。
 */

export const GATE_VERIFY_CORRIDOR_AUDIT_VERSION = '1.0.0' as const;

export type GateReuseKind =
  | 'main_chain_gate_eval'
  | 'corridor_own_guard'
  | 'verification_snapshot'
  | 'unified_assessment'
  | 'none_or_unknown';

export type GateVerifyCorridorAuditRow = {
  corridorId: string;
  productSurface: string;
  usesMainChainGateEval: boolean;
  gateReuse: GateReuseKind;
  verifyAuthority: string;
  canWriteWithoutMainChainGate: boolean;
  auditStatus: 'proven' | 'needs_audit' | 'shadow_only';
  notes: string;
};

/**
 * MAIN_CHAIN_GATE_BLOCK_SCOPE — documentation SSOT (see also ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md §GATE BLOCK).
 *
 * Proven **only** inside `route_and_run` Claude SM: when GATE_EVAL yields BLOCK,
 * pre_plan terminates with `terminal_blocked` and **must not** enter PLAN_GEN.
 * Independent Apply corridors (Iceland / Arrange / Unified / Actions / Mobile / TEP)
 * do **not** inherit this proof; see GATE_VERIFY_CORRIDOR_AUDIT_MATRIX rows (`needs_audit`).
 */
export const MAIN_CHAIN_GATE_BLOCK_SCOPE =
  'Only proven inside route_and_run Claude SM: GATE BLOCK → terminal_blocked, no PLAN_GEN.' as const;

export const GATE_VERIFY_CORRIDOR_AUDIT_MATRIX: readonly GateVerifyCorridorAuditRow[] = [
  {
    corridorId: 'route_and_run_sm',
    productSurface: 'Main Agent',
    usesMainChainGateEval: true,
    gateReuse: 'main_chain_gate_eval',
    verifyAuthority: 'Kernel VERIFY (main chain)',
    canWriteWithoutMainChainGate: false,
    auditStatus: 'proven',
    notes: 'GATE BLOCK hard-stops before PLAN_GEN; ADVICE_ONLY by default',
  },
  {
    corridorId: 'iceland_apply',
    productSurface: 'Iceland',
    usesMainChainGateEval: false,
    gateReuse: 'corridor_own_guard',
    verifyAuthority: 'Iceland proposal verification / preview bridge',
    canWriteWithoutMainChainGate: true,
    auditStatus: 'needs_audit',
    notes: 'Confirm→Apply 独立；须审计 proposal status / freshness',
  },
  {
    corridorId: 'arrange_apply',
    productSurface: 'Arrange',
    usesMainChainGateEval: false,
    gateReuse: 'corridor_own_guard',
    verifyAuthority: 'PlanProposal.validation + EffectivePlanWriter',
    canWriteWithoutMainChainGate: true,
    auditStatus: 'needs_audit',
    notes: 'Shadow changes forbidden; not main-chain GATE_EVAL node',
  },
  {
    corridorId: 'unified_execute',
    productSurface: 'Unified Decision',
    usesMainChainGateEval: false,
    gateReuse: 'unified_assessment',
    verifyAuthority: 'Unified Assessment / authorize',
    canWriteWithoutMainChainGate: true,
    auditStatus: 'needs_audit',
    notes: 'Kernel VERIFY 不是唯一裁决权威',
  },
  {
    corridorId: 'actions_commit',
    productSurface: 'Agent Actions',
    usesMainChainGateEval: false,
    gateReuse: 'corridor_own_guard',
    verifyAuthority: 'Action preview + side-effect rules',
    canWriteWithoutMainChainGate: true,
    auditStatus: 'needs_audit',
    notes: 'Commit path independent of GATE_EVAL node',
  },
  {
    corridorId: 'itinerary_adjust_apply',
    productSurface: 'Main Agent',
    usesMainChainGateEval: true,
    gateReuse: 'main_chain_gate_eval',
    verifyAuthority: 'Main-chain VERIFY then apply flag / AUTO corridor',
    canWriteWithoutMainChainGate: false,
    auditStatus: 'proven',
    notes: 'Advice segment uses SM; apply short-circuit still requires prior draft/guards',
  },
  {
    corridorId: 'mobile_verified_apply',
    productSurface: 'Mobile',
    usesMainChainGateEval: false,
    gateReuse: 'verification_snapshot',
    verifyAuthority: 'Mobile Verification Snapshot',
    canWriteWithoutMainChainGate: true,
    auditStatus: 'needs_audit',
    notes: 'BFF 独立；须审计 snapshot freshness',
  },
  {
    corridorId: 'ortools_shadow',
    productSurface: 'Shadow',
    usesMainChainGateEval: false,
    gateReuse: 'none_or_unknown',
    verifyAuthority: 'lab/compare only',
    canWriteWithoutMainChainGate: false,
    auditStatus: 'shadow_only',
    notes: 'Must never Apply shadowChanges as authoritative plan',
  },
] as const;
