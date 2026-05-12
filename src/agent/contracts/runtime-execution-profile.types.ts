/**
 * RuntimeExecutionProfile — 单次 route_and_run 的「运行时画像」权威语义。
 *
 * - 与 legacy `RouteType` / `system_mode` / `orchestration_mode_final` 正交分层；
 * - `routingDecision.route` 仅作 compatibility label（见 observability.internal_route_label）。
 * - DEDUP / replay 属于 runtime.reusePolicy，不是 cognition。
 *
 * ADR：见仓库讨论「Execution Truth Consolidation」Phase 1。
 */

export type CognitionDepth = 'NONE' | 'LIGHT' | 'DELIBERATIVE' | 'PLANNING';

export type CognitionStyle = 'RETRIEVAL' | 'REASONING' | 'WORKFLOW' | 'HYBRID';

export type ExecutionEngine =
  | 'NOT_RUN'
  | 'SYSTEM1_EXECUTOR'
  | 'LIGHTWEIGHT_QA'
  | 'STATE_MACHINE'
  | 'REACT_ORCHESTRATOR';

export type ToolDepth = 'NONE' | 'SINGLE' | 'MULTI';

export type DeterminismClass = 'DETERMINISTIC' | 'HYBRID' | 'OPEN_ENDED';

export type ReusePolicy = 'FRESH' | 'DEDUP_REPLAY' | 'PARTIAL_REUSE';

export type LatencyClass = 'FAST' | 'INTERACTIVE' | 'LONG_RUNNING';

/** 用户侧 / 仪表盘聚合用语，不与 SYSTEM1_EXECUTOR 混淆 */
export type UserFacingObservabilityMode = 'FAST_PATH' | 'DEEP_REASONING' | 'PLANNING_PIPELINE';

export interface RuntimeExecutionProfile {
  cognition: {
    depth: CognitionDepth;
    style: CognitionStyle;
  };
  execution: {
    engine: ExecutionEngine;
    toolDepth: ToolDepth;
    determinism: DeterminismClass;
  };
  runtime: {
    reusePolicy: ReusePolicy;
    latencyClass: LatencyClass;
  };
  observability: {
    userFacingMode: UserFacingObservabilityMode;
    /** Legacy RouteType / routingDecision.route，仅兼容旧管线与实验分组 */
    internal_route_label?: string;
    /** 顶层编排标签（若本响应已写入 observability.orchestration_mode_final，与此一致更佳） */
    orchestration_mode_hint?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
  };
}
