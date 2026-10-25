/**
 * System1 Runtime Contract v1 — 边界冻结。
 * 扩路径 / 改职责前先读本文件；违反 = 越权进 System2。
 *
 * System1 ≠ Decision Engine
 * System1 = Evidence-aware Query Runtime
 */

export const SYSTEM1_RUNTIME_BOUNDARY = {
  schemaId: 'tripnara.system1_runtime_boundary@v1',
  version: 1,
  role: 'Evidence-aware Query Runtime',
  not: 'Decision Engine / Mini System2',
  /**
   * ClaimPlan（工程符号仍可能写作 candidateClaimTypes）：
   * 回答结构规划，不是排序候选。
   */
  pipeline: [
    'Input',
    'TaskFrame',
    'Authority',
    'ClaimPlan',
    'RequiredEvidence',
    'Acquisition',
    'Sufficiency',
    'Claims',
    'ClaimGroundingEval',
    'Trace',
  ] as const,
  responsibilities: [
    'Interpret user query into TaskFrame',
    'Determine allowable authority',
    'Predict ClaimPlan (possible claim types)',
    'Resolve required evidence',
    'Acquire and normalize evidence',
    'Evaluate evidence sufficiency',
    'Produce grounded claims',
    'Return answer, ask user, or escalate',
  ] as const,
  never: [
    'modifies trip state',
    'optimizes itinerary',
    'resolves trade-offs',
    'arbitrates conflicts',
    'executes irreversible actions',
  ] as const,
  allows: ['READ', 'EXPLAIN', 'ASSESS', 'RECOMMEND'] as const,
  forbids: [
    'WRITE_APPLY',
    'MULTI_OPTION_SEARCH',
    'OPTIMIZE',
    'PLAN_MUTATE',
    'CONFLICT_ARBITRATE',
  ] as const,
  layers: {
    unifiedIntent: '语义层：用户想表达什么（CONSULT / ASSESS_IMPACT / …）',
    agentTaskContract: '治理层：系统允许执行什么能力（TRIP_QUERY / LIVE_EXECUTION / …）',
    system1TaskFrame: '运行层：为回答需要什么证据',
  },
  layerFlow: [
    'User Input',
    'UnifiedIntent',
    'AgentTaskContract',
    'System1TaskFrame',
    'Evidence Runtime',
  ] as const,
  mcpPolicy: {
    decisionMustCre: ['road', 'weather', 'route', 'safety', 'feasibility'],
    recommendationMayBeLight: ['hotel', 'restaurant', 'poi', 'inventory'],
  },
  /** 下一阶段：Runtime 验证，不是继续扩 System1 设计 */
  validationMetrics: [
    'Claim Grounding Rate',
    'Evidence Sufficiency Precision',
    'Routing Accuracy',
  ] as const,
  /** 未来 Acquisition：Critical first + sufficiency early stop（尚未实现） */
  acquisitionBacklog: ['EvidencePriority', 'SufficiencyEarlyStop'] as const,
  goldenCases: [
    '明天还能走 F208 吗？',
    '哪一天没有住宿？',
    '冰河湖和钻石沙滩哪个更值得去？',
  ] as const,
  stopExpandingFastPaths: true,
  enterValidationPhase: true,
} as const;

export type System1RuntimeBoundary = typeof SYSTEM1_RUNTIME_BOUNDARY;
