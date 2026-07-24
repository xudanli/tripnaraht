/**
 * P1-2：ProposalLike 是文档概念，不是代码统一基类。
 * 禁止引入伪父类把各走廊 Proposal 强行合并。
 */

export const PROPOSAL_LIKE_CONCEPTUAL_VERSION = '1.0.0' as const;

export type ProposalLikeKind =
  | 'arrange_plan_proposal'
  | 'iceland_initial_plan_proposal'
  | 'pending_itinerary_adjust_draft'
  | 'unified_decision_preview'
  | 'planning_assistant_plan'
  | 'ortools_shadow_attachment';

export type ProposalLikeRegistryRow = {
  kind: ProposalLikeKind;
  /** Conceptual label for docs / UI */
  conceptualLabel: string;
  /** Actual code type or metadata key */
  actualTypeOrKey: string;
  productSurface: string;
  authoritativeApply: boolean;
  notes: string;
};

export const PROPOSAL_LIKE_IS_NOT_A_BASE_CLASS =
  'ProposalLike is a documentation concept only; there is no shared TypeScript base class.' as const;

export const PROPOSAL_LIKE_REGISTRY: readonly ProposalLikeRegistryRow[] = [
  {
    kind: 'arrange_plan_proposal',
    conceptualLabel: 'Arrange PlanProposal',
    actualTypeOrKey: 'PlanProposal (arrange-itinerary/types)',
    productSurface: 'Arrange',
    authoritativeApply: true,
    notes: '局部 Canonical；Apply 禁 ortoolsShadow.shadowChanges',
  },
  {
    kind: 'iceland_initial_plan_proposal',
    conceptualLabel: 'Iceland Initial Plan Proposal',
    actualTypeOrKey: 'IcelandInitialPlanPreviewService proposal',
    productSurface: 'Iceland',
    authoritativeApply: true,
    notes: 'Confirm 不写库；Apply 写 PlanVersion + Trip',
  },
  {
    kind: 'pending_itinerary_adjust_draft',
    conceptualLabel: 'ITINERARY_ADJUST pending draft',
    actualTypeOrKey: 'pending_itinerary_adjust_draft metadata',
    productSurface: 'Main Agent',
    authoritativeApply: true,
    notes: '写 Trip/ItineraryItem；非 PlanProposal 父类型',
  },
  {
    kind: 'unified_decision_preview',
    conceptualLabel: 'Unified Decision Preview / Option',
    actualTypeOrKey: 'Unified Decision Gateway preview',
    productSurface: 'Unified Decision',
    authoritativeApply: true,
    notes: '独立 Assessment / Execute 走廊',
  },
  {
    kind: 'planning_assistant_plan',
    conceptualLabel: 'Planning Assistant Plan',
    actualTypeOrKey: 'PlanningAssistantV2 plan confirm',
    productSurface: 'Planning Assistant',
    authoritativeApply: true,
    notes: '并行产品面，未并入 route_and_run 主链',
  },
  {
    kind: 'ortools_shadow_attachment',
    conceptualLabel: 'OR-Tools Shadow',
    actualTypeOrKey: 'ortoolsShadow / shadowChanges',
    productSurface: 'Shadow',
    authoritativeApply: false,
    notes: '仅候选比较；禁止直接 Apply；前端须标非权威',
  },
] as const;
