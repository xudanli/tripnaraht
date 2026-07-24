import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 决策账本自愈 — metrics 切片（与运行时 `observability.ledger_healing.metrics` 对齐）。
 */
export class LedgerHealingMetricsDto {
  @ApiProperty({
    example: 1,
    description: '进入阻塞式 reconcile 前，执行器视角的 INVALIDATED 节点数',
  })
  initial_invalidated!: number;

  @ApiProperty({
    example: 1,
    description: '各 merge loop 中 secondary 失效数的峰值（次生级联强度）',
  })
  secondary_invalidated!: number;

  @ApiProperty({
    example: 2,
    description: '内核写回循环次数（与 orchestrator trace 中 `loop_*` 行数对齐）',
  })
  loops!: number;
}

/**
 * 单行 trace 的结构化投影（phase / action / target_nodes）。
 */
export class LedgerHealingStepDto {
  @ApiProperty({
    example: 'merge_loop',
    description: '`merge_loop`：写回轮次；`kernel`：其它内核事件；`gate`：未跑阻塞 reconcile 时的门控说明',
  })
  phase!: string;

  @ApiProperty({
    example: 'loop_0: merged=1 secondary=1 stable=false',
    description: '与内核 trace 字符串一致，便于与日志对账',
  })
  action!: string;

  @ApiProperty({
    type: [String],
    example: ['HOTEL_VIK'],
    description: '从该行 trace 解析出的方括号 token（多为 nodeId）',
  })
  target_nodes!: string[];
}

/**
 * `RouteAndRunResponseDto.observability.ledger_healing` 的 OpenAPI 模型（v1）。
 *
 * 说明：`status` 为 **UI 聚合三态**；引擎细粒度状态见 `reconcile_status`（如 `PARSE_ERROR`、`ESCALATED_HARD_CONSTRAINT` 等）。
 */
export class LedgerHealingObservabilityDto {
  @ApiProperty({
    enum: ['CONVERGED', 'ESCALATED', 'NO_OP'],
    example: 'CONVERGED',
    description: 'UI 三态：成功收敛 / 未收敛或错误聚合 / 未执行阻塞 reconcile（含 advisory 延期、缺依赖跳过）',
  })
  status!: 'CONVERGED' | 'ESCALATED' | 'NO_OP';

  @ApiPropertyOptional({
    example: 'CONVERGED',
    description:
      '引擎 reconcile 终态（与 `IncrementalRecomputeOrchestrator` 对齐）。示例：`CONVERGED` | `ESCALATED` | `ESCALATED_HARD_CONSTRAINT` | `PARSE_ERROR` | `LLM_ERROR` | `IDLE` | …',
  })
  reconcile_status?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['POI_REYNISFJARA'],
    description: '本轮进入 reconcile 前的 INVALIDATED 节点 id，供前端与行程卡片联动',
  })
  affected_node_ids?: string[];

  @ApiProperty({ type: LedgerHealingMetricsDto })
  metrics!: LedgerHealingMetricsDto;

  @ApiProperty({ type: [LedgerHealingStepDto] })
  steps!: LedgerHealingStepDto[];

  @ApiPropertyOptional({
    description: 'Ledger nodeId → Decision Semantics decisionId（与 Memory Console decision_ledger_causality 对齐）',
    example: { POI_REYNISFJARA: 'dec_1710000000_abc123' },
  })
  user_decision_by_node_id?: Record<string, string>;
}

/** Swagger / 静态 fixture 共用的「冰岛南岸 · 成功自愈」观测片段（与生产 trace 形态一致）。 */
export const LEDGER_HEALING_ICELAND_SUCCESS_EXAMPLE = {
  status: 'CONVERGED',
  reconcile_status: 'CONVERGED',
  affected_node_ids: ['POI_REYNISFJARA'],
  metrics: {
    initial_invalidated: 1,
    secondary_invalidated: 1,
    loops: 2,
  },
  steps: [
    {
      phase: 'merge_loop',
      action: 'loop_0: merged=1 secondary=1 stable=false',
      target_nodes: [],
    },
    {
      phase: 'merge_loop',
      action: 'loop_1: merged=1 secondary=0 stable=true',
      target_nodes: [],
    },
    {
      phase: 'kernel',
      action: 'converged: snapshot_version=2',
      target_nodes: [],
    },
  ],
};
