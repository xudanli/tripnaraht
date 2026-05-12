import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { attachFreshRuntimeMaterialization } from './fresh-runtime-adapter.util';

describe('fresh-runtime-adapter.util', () => {
  const prevObs = process.env.RUNTIME_MATERIALIZATION_OBS;

  afterEach(() => {
    if (prevObs === undefined) delete process.env.RUNTIME_MATERIALIZATION_OBS;
    else process.env.RUNTIME_MATERIALIZATION_OBS = prevObs;
  });

  it('skips when env off', () => {
    process.env.RUNTIME_MATERIALIZATION_OBS = '0';
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const response = {
      observability: { latency_ms: 1 },
    } as RouteAndRunResponseDto;
    attachFreshRuntimeMaterialization(request, response);
    expect((response.observability as Record<string, unknown>).runtime_materialization).toBeUndefined();
  });

  it('attaches slice when env on and slot empty', () => {
    process.env.RUNTIME_MATERIALIZATION_OBS = '1';
    const request = {
      request_id: 'r1',
      trip_id: ' trip-x ',
    } as RouteAndRunRequestDto;
    const response = {
      observability: {
        latency_ms: 1,
        trace: { route_decision: { route_policy: 'LEGACY' } },
      },
    } as RouteAndRunResponseDto;
    attachFreshRuntimeMaterialization(request, response);
    const rm = (response.observability as Record<string, unknown>).runtime_materialization as {
      unified_state: { artifactRefs: string[] };
      execution_graph?: { nodes: { id: string }[] };
    };
    expect(rm).toBeDefined();
    expect(rm.unified_state.artifactRefs).toContain('trip-x');
    expect(rm.execution_graph?.nodes.some((n) => n.id.endsWith(':fresh_sink'))).toBe(true);
  });

  it('does not overwrite existing runtime_materialization', () => {
    process.env.RUNTIME_MATERIALIZATION_OBS = '1';
    const existing = { schema: 'keep' };
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const response = {
      observability: { latency_ms: 1, runtime_materialization: existing },
    } as RouteAndRunResponseDto;
    attachFreshRuntimeMaterialization(request, response);
    expect((response.observability as Record<string, unknown>).runtime_materialization).toBe(existing);
  });
});
