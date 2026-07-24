/**
 * P0-3：Conceptual 文档名 ↔ 真实代码类型冻结表。
 * 对外只使用 Actual；Conceptual 须标注为文档抽象，禁止当作可 import 类型名。
 */

export const AGENT_CONCEPTUAL_VS_ACTUAL_VERSION = '1.0.0' as const;

export type AgentConceptualVsActualRow = {
  conceptual: string;
  actual: string;
  scope: string;
  notes: string;
};

/**
 * 当前不存在贯穿整个智能体主链的统一 `contextHash`。
 * 近邻字段：snapshotId / contextVersion / expected_negotiation_hash / effectivePlanVersionId。
 */
export const AGENT_NO_GLOBAL_CONTEXT_HASH =
  'No unified contextHash on route_and_run main chain' as const;

export const AGENT_CONCEPTUAL_VS_ACTUAL: readonly AgentConceptualVsActualRow[] = [
  {
    conceptual: 'AgentRequest',
    actual: 'RouteAndRunRequestDto',
    scope: 'route_and_run',
    notes: '对外 Canonical HTTP DTO',
  },
  {
    conceptual: 'AgentResponse',
    actual: 'RouteAndRunResponseDto',
    scope: 'route_and_run',
    notes: '对外 Canonical HTTP DTO',
  },
  {
    conceptual: 'VerificationResult',
    actual: 'VerificationReport / VerificationIssue',
    scope: 'DecisionKernel',
    notes: '主链 VERIFY 裁决报告',
  },
  {
    conceptual: 'RepairProposal',
    actual: '(none — corridor-specific)',
    scope: 'repair corridors',
    notes: '无统一类型；DSO executeRepair / Iceland repair-once 等分散实现',
  },
  {
    conceptual: 'contextHash',
    actual: AGENT_NO_GLOBAL_CONTEXT_HASH,
    scope: 'main chain',
    notes: '使用 snapshotId / contextVersion / negotiationHash 等，勿虚构全局 contextHash',
  },
  {
    conceptual: 'TravelContext',
    actual: 'TravelContextIdentity (+ bindings)',
    scope: 'RFC-003 partial',
    notes: 'Canonical 目标 SSOT，尚未贯通 Claude SM 主链',
  },
  {
    conceptual: 'DecisionProblem',
    actual: 'Rfc001DecisionProblem (+ TEP/Unified variants)',
    scope: 'multi-corridor',
    notes: '多套契约并存',
  },
  {
    conceptual: 'PlanProposal',
    actual: 'PlanProposal (arrange-itinerary)',
    scope: 'Arrange',
    notes: '局部 Canonical；非所有草案的统一父类型',
  },
  {
    conceptual: 'ProposalLike',
    actual:
      'Arrange PlanProposal | Iceland Proposal | pending_itinerary_adjust_draft | Unified Preview | PA Plan',
    scope: 'documentation',
    notes:
      '文档概念，不是代码基类；见 proposal-like.conceptual.constants.ts PROPOSAL_LIKE_REGISTRY',
  },
] as const;
