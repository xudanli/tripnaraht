import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { DecisionLedgerSnapshot } from '../memory/decision-ledger/decision-ledger.types';
import type { HydratedGovernanceRuntimeContext } from '../../governance/activation/governance-activation.types';
import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';
import type { DecisionOsWorldState } from './decision-os-world-state.types';
import { compressWorldStateToNarrative } from './decision-os-narrative-projection.util';

export type DecisionOsExecutionContextObservabilityV1 = {
  revision: 'v1';
  trip_id: string | null;
  request_id: string;
  has_world_state: boolean;
  has_governance: boolean;
  has_plan_delta: boolean;
  plan_delta_count: number;
  narrative_chars: number;
  memory_snapshot_id: string;
};

export type DecisionOsExecutionContextInitializer = {
  request: RouteAndRunRequestDto;
  memory: AgentMemoryContext;
  governance?: HydratedGovernanceRuntimeContext | null;
  worldState?: DecisionOsWorldState | null;
  planDelta?: PlanDeltaIR[];
};

/**
 * 【上下文宪法】Decision OS 运行时核心执行上下文。
 *
 * 严格遵循：单向数据流、读写隔离、请求级冻结。
 * 与 ALS 轻量 `AgentExecutionContext`（span/binding）正交，承载 trip/world/ledger/governance 语义。
 */
export class DecisionOsExecutionContext {
  public readonly tripId: string | null;
  public readonly requestId: string;
  public readonly userId: string | null;

  private _worldState: DecisionOsWorldState | null;
  private _decisionLedger: DecisionLedgerSnapshot | null;

  public readonly memorySnapshot: Readonly<AgentMemoryContext>;
  public readonly governanceState: Readonly<HydratedGovernanceRuntimeContext> | null;

  public readonly planDelta: ReadonlyArray<PlanDeltaIR>;
  public readonly activeTripSummary: string;

  constructor(initializer: DecisionOsExecutionContextInitializer) {
    const tripRaw = initializer.request.trip_id?.trim() ?? initializer.memory.tripId?.trim() ?? '';
    this.tripId = tripRaw || null;
    this.requestId = initializer.request.request_id;
    this.userId = initializer.memory.userId;

    this.memorySnapshot = Object.freeze(initializer.memory);
    this.governanceState = initializer.governance
      ? Object.freeze(initializer.governance)
      : null;

    this._worldState = initializer.worldState
      ? structuredClone(initializer.worldState)
      : null;
    this._decisionLedger = initializer.memory.decisionLedger
      ? structuredClone(initializer.memory.decisionLedger)
      : null;

    this.planDelta = Object.freeze([...(initializer.planDelta ?? [])]);
    this.activeTripSummary = compressWorldStateToNarrative(
      this._worldState,
      this.tripId ?? '',
    );
  }

  /**
   * Phase 5 意图编译后刷新 planDelta（重建上下文，其余字段保持一致）。
   */
  static withPlanDelta(
    base: DecisionOsExecutionContext,
    request: RouteAndRunRequestDto,
    planDelta: PlanDeltaIR[],
  ): DecisionOsExecutionContext {
    return new DecisionOsExecutionContext({
      request,
      memory: base.memorySnapshot as AgentMemoryContext,
      governance: base.governanceState,
      worldState: base.worldState,
      planDelta,
    });
  }

  get worldState(): DecisionOsWorldState | null {
    return this._worldState;
  }

  get decisionLedger(): DecisionLedgerSnapshot | null {
    return this._decisionLedger;
  }

  /**
   * Kernel/Tools 唯一收拢式世界状态变更入口（单次 Tick 内可写）。
   */
  updateWorldState(mutator: (current: DecisionOsWorldState | null) => DecisionOsWorldState | null): void {
    this._worldState = mutator(this._worldState);
  }

  /**
   * Ledger 推进入口（仅 Kernel 提交阶段调用）。
   */
  commitDecisionLedger(next: DecisionLedgerSnapshot | null): void {
    this._decisionLedger = next ? structuredClone(next) : null;
  }

  /**
   * 将叙事投影注入 conversation_context.recent_messages（取代散落 enricher 直写）。
   */
  applyNarrativeToConversationContext(request: RouteAndRunRequestDto): void {
    if (!this.activeTripSummary.trim()) {
      return;
    }
    const prev = request.conversation_context?.recent_messages ?? [];
    request.conversation_context = {
      ...request.conversation_context,
      recent_messages: [this.activeTripSummary, ...prev],
    };
  }

  toObservabilitySlice(): DecisionOsExecutionContextObservabilityV1 {
    return {
      revision: 'v1',
      trip_id: this.tripId,
      request_id: this.requestId,
      has_world_state: !!this._worldState,
      has_governance: !!this.governanceState,
      has_plan_delta: this.planDelta.length > 0,
      plan_delta_count: this.planDelta.length,
      narrative_chars: this.activeTripSummary.length,
      memory_snapshot_id: this.memorySnapshot.snapshotId,
    };
  }
}
