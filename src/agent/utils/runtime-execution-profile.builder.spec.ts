import { RouteType } from '../interfaces/router.interface';
import {
  buildRuntimeExecutionProfileClaudeDynamicAssembly,
  buildRuntimeExecutionProfileDedupReplay,
  buildRuntimeExecutionProfileLegacyAssembly,
} from './runtime-execution-profile.builder';

describe('runtime-execution-profile.builder', () => {
  it('DEDUP replay: cognition NONE, reuse DEDUP_REPLAY, engine NOT_RUN', () => {
    const p = buildRuntimeExecutionProfileDedupReplay('SYSTEM2_REASONING');
    expect(p.cognition.depth).toBe('NONE');
    expect(p.runtime.reusePolicy).toBe('DEDUP_REPLAY');
    expect(p.execution.engine).toBe('NOT_RUN');
    expect(p.observability.orchestration_mode_hint).toBe('DEDUP');
    expect(p.observability.internal_route_label).toBe('SYSTEM2_REASONING');
  });

  it('lightweight QA: engine LIGHTWEIGHT_QA, userFacing FAST_PATH', () => {
    const p = buildRuntimeExecutionProfileClaudeDynamicAssembly({
      compatibilityRoute: RouteType.SYSTEM2_REASONING,
      lightweightKnowledgeQa: true,
      isSystem1ExecutorPath: false,
      routingTaskType: 'DATA_LOOKUP',
      stepsExecutedLength: 2,
      liveToolInvocations: 1,
      heuristicStateMachineRun: false,
    });
    expect(p.execution.engine).toBe('LIGHTWEIGHT_QA');
    expect(p.observability.userFacingMode).toBe('FAST_PATH');
    expect(p.runtime.reusePolicy).toBe('FRESH');
  });

  it('System1 executor path: engine SYSTEM1_EXECUTOR', () => {
    const p = buildRuntimeExecutionProfileClaudeDynamicAssembly({
      compatibilityRoute: RouteType.SYSTEM1_RAG,
      lightweightKnowledgeQa: false,
      isSystem1ExecutorPath: true,
      stepsExecutedLength: 1,
      heuristicStateMachineRun: false,
    });
    expect(p.execution.engine).toBe('SYSTEM1_EXECUTOR');
    expect(p.cognition.style).toBe('RETRIEVAL');
  });

  it('LEGACY assembly: SYSTEM1 → SYSTEM1_EXECUTOR + LEGACY hint', () => {
    const p = buildRuntimeExecutionProfileLegacyAssembly({
      compatibilityRoute: RouteType.SYSTEM1_RAG,
      toolCalls: 1,
      browserSteps: 0,
    });
    expect(p.execution.engine).toBe('SYSTEM1_EXECUTOR');
    expect(p.observability.orchestration_mode_hint).toBe('LEGACY');
    expect(p.runtime.reusePolicy).toBe('FRESH');
  });

  it('LEGACY assembly: SYSTEM2 → REACT_ORCHESTRATOR', () => {
    const p = buildRuntimeExecutionProfileLegacyAssembly({
      compatibilityRoute: RouteType.SYSTEM2_REASONING,
      toolCalls: 2,
      browserSteps: 0,
    });
    expect(p.execution.engine).toBe('REACT_ORCHESTRATOR');
    expect(p.observability.orchestration_mode_hint).toBe('LEGACY');
  });
});
