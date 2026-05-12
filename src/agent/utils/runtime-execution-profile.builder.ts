import type { RouteType } from '../interfaces/router.interface';
import type { TaskType } from './orchestration-signals.util';
import type {
  DeterminismClass,
  LatencyClass,
  RuntimeExecutionProfile,
  ToolDepth,
  UserFacingObservabilityMode,
} from '../contracts/runtime-execution-profile.types';

function inferToolDepth(stepsExecutedLen: number, liveToolCalls: number): ToolDepth {
  const n = Math.max(stepsExecutedLen, liveToolCalls);
  if (n <= 0) return 'NONE';
  if (n === 1) return 'SINGLE';
  return 'MULTI';
}

/**
 * 请求去重命中缓存：**未发生新一轮认知执行**，仅重用既有结果。
 */
export function buildRuntimeExecutionProfileDedupReplay(
  internalRouteLabel?: string,
): RuntimeExecutionProfile {
  return {
    cognition: { depth: 'NONE', style: 'RETRIEVAL' },
    execution: {
      engine: 'NOT_RUN',
      toolDepth: 'NONE',
      determinism: 'DETERMINISTIC',
    },
    runtime: {
      reusePolicy: 'DEDUP_REPLAY',
      latencyClass: 'FAST',
    },
    observability: {
      userFacingMode: 'FAST_PATH',
      ...(internalRouteLabel ? { internal_route_label: internalRouteLabel } : {}),
      orchestration_mode_hint: 'DEDUP',
    },
  };
}

/**
 * Claude Dynamic 组装阶段：由兼容 route + 路径标志推导画像（Phase 1 启发式）。
 * StateMachine vs ReAct 的精确区分后续由编排出口显式传入 flags 替换启发式。
 */
export function buildRuntimeExecutionProfileClaudeDynamicAssembly(params: {
  compatibilityRoute: RouteType | string;
  lightweightKnowledgeQa: boolean;
  isSystem1ExecutorPath: boolean;
  routingTaskType?: TaskType;
  stepsExecutedLength: number;
  /** 可选：来自 live_sensor_audit 等的工具调用计数近似 */
  liveToolInvocations?: number;
  /** 启发式：状态机流水线（受约束迁移），非开放式 ReAct */
  heuristicStateMachineRun?: boolean;
}): RuntimeExecutionProfile {
  const routeStr = String(params.compatibilityRoute ?? '');
  const internal = routeStr || undefined;
  const toolDepth = inferToolDepth(
    params.stepsExecutedLength,
    params.liveToolInvocations ?? 0,
  );

  if (params.isSystem1ExecutorPath && routeStr.startsWith('SYSTEM1')) {
    const isRag = routeStr.includes('RAG');
    return {
      cognition: { depth: 'LIGHT', style: isRag ? 'RETRIEVAL' : 'REASONING' },
      execution: {
        engine: 'SYSTEM1_EXECUTOR',
        toolDepth: toolDepth === 'NONE' ? 'SINGLE' : toolDepth,
        determinism: 'HYBRID',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'FAST' },
      observability: {
        userFacingMode: 'FAST_PATH',
        ...(internal ? { internal_route_label: internal } : {}),
        orchestration_mode_hint: 'CLAUDE_DYNAMIC',
      },
    };
  }

  if (params.lightweightKnowledgeQa) {
    return {
      cognition: { depth: 'LIGHT', style: 'HYBRID' },
      execution: {
        engine: 'LIGHTWEIGHT_QA',
        toolDepth,
        determinism: 'HYBRID',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'INTERACTIVE' },
      observability: {
        userFacingMode: 'FAST_PATH',
        ...(internal ? { internal_route_label: internal } : {}),
        orchestration_mode_hint: 'CLAUDE_DYNAMIC',
      },
    };
  }

  if (params.heuristicStateMachineRun) {
    return {
      cognition: { depth: 'PLANNING', style: 'WORKFLOW' },
      execution: {
        engine: 'STATE_MACHINE',
        toolDepth,
        determinism: 'DETERMINISTIC',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'LONG_RUNNING' },
      observability: {
        userFacingMode: 'PLANNING_PIPELINE',
        ...(internal ? { internal_route_label: internal } : {}),
        orchestration_mode_hint: 'CLAUDE_DYNAMIC',
      },
    };
  }

  const determinism: DeterminismClass = 'OPEN_ENDED';
  const latencyClass: LatencyClass = 'LONG_RUNNING';
  let userFacing: UserFacingObservabilityMode = 'DEEP_REASONING';
  let depth: RuntimeExecutionProfile['cognition']['depth'] = 'DELIBERATIVE';

  if (params.routingTaskType === 'TRIP_PLANNING') {
    depth = 'PLANNING';
    userFacing = 'PLANNING_PIPELINE';
  }

  return {
    cognition: { depth, style: 'REASONING' },
    execution: {
      engine: 'REACT_ORCHESTRATOR',
      toolDepth,
      determinism,
    },
    runtime: { reusePolicy: 'FRESH', latencyClass },
    observability: {
      userFacingMode: userFacing,
      ...(internal ? { internal_route_label: internal } : {}),
      orchestration_mode_hint: 'CLAUDE_DYNAMIC',
    },
  };
}

/**
 * LEGACY `routeAndRun` 出口：在 Assembler 未写 profile 时由 finalization 阶段补全，与 CLAUDE_* 路径对齐。
 */
export function buildRuntimeExecutionProfileLegacyAssembly(params: {
  compatibilityRoute: RouteType | string;
  toolCalls: number;
  browserSteps: number;
}): RuntimeExecutionProfile {
  const routeStr = String(params.compatibilityRoute ?? '');
  const internal = routeStr || undefined;
  const live = params.toolCalls + params.browserSteps;
  const n = Math.max(live, live > 0 ? 1 : 0);
  const toolDepth: ToolDepth =
    n <= 0 ? 'NONE' : n === 1 ? 'SINGLE' : 'MULTI';

  if (routeStr.startsWith('SYSTEM1')) {
    const isRag = routeStr.includes('RAG');
    return {
      cognition: { depth: 'LIGHT', style: isRag ? 'RETRIEVAL' : 'REASONING' },
      execution: {
        engine: 'SYSTEM1_EXECUTOR',
        toolDepth: toolDepth === 'NONE' ? 'SINGLE' : toolDepth,
        determinism: 'HYBRID',
      },
      runtime: { reusePolicy: 'FRESH', latencyClass: 'FAST' },
      observability: {
        userFacingMode: 'FAST_PATH',
        ...(internal ? { internal_route_label: internal } : {}),
        orchestration_mode_hint: 'LEGACY',
      },
    };
  }

  return {
    cognition: { depth: 'DELIBERATIVE', style: 'REASONING' },
    execution: {
      engine: 'REACT_ORCHESTRATOR',
      toolDepth,
      determinism: 'OPEN_ENDED',
    },
    runtime: { reusePolicy: 'FRESH', latencyClass: 'INTERACTIVE' },
    observability: {
      userFacingMode: 'DEEP_REASONING',
      ...(internal ? { internal_route_label: internal } : {}),
      orchestration_mode_hint: 'LEGACY',
    },
  };
}
