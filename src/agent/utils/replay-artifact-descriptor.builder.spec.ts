import { attachFullResponseReplayArtifactDescriptor } from './replay-artifact-descriptor.builder';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

function baseResponse(): RouteAndRunResponseDto {
  return {
    request_id: 'r1',
    route: { route: 'SYSTEM1_RAG' } as RouteAndRunResponseDto['route'],
    result: { status: 'OK', answer_text: 'x', payload: {} },
    explain: { decision_log: [] } as RouteAndRunResponseDto['explain'],
    observability: {
      latency_ms: 1,
      router_ms: 0,
      system_mode: 'SYSTEM1',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
      replay_cache_provenance: {
        generatedAt: Date.now(),
        cognitionDomains: ['OUTDOOR_ROUTE'],
        freshness: { weatherVersion: 'w1' },
      },
    },
  };
}

describe('attachFullResponseReplayArtifactDescriptor', () => {
  it('maps invalidation NONE → replayEligibility FULL', () => {
    const r = baseResponse();
    attachFullResponseReplayArtifactDescriptor(r);
    expect(r.observability.replay_artifact_descriptor?.artifactType).toBe('FULL_RESPONSE');
    expect(r.observability.replay_artifact_descriptor?.replayEligibility).toBe('FULL');
    expect(r.observability.replay_artifact_descriptor?.artifactIdentity.artifactId).toMatch(/^[a-f0-9]{64}$/);
    expect(r.observability.replay_artifact_descriptor?.replayConfidence.band).toBe('HIGH');
    expect(r.observability.replay_artifact_descriptor?.artifactIdentity.material.cognitionScope).toBe(
      'OUTDOOR_ROUTE',
    );
    expect(r.observability.replay_artifact_descriptor?.freshnessDependencies).toEqual(['weatherVersion']);
    expect(r.observability.replay_artifact_descriptor?.affectedCognitiveDomains).toContain('OUTDOOR_ROUTE');
  });

  it('maps PARTIAL invalidation → PARTIAL eligibility', () => {
    const r = baseResponse();
    (r.observability as any).replay_invalidation_decision = {
      scope: 'PARTIAL_COGNITIVE_BRANCH',
      domains: ['INVENTORY'],
    };
    attachFullResponseReplayArtifactDescriptor(r);
    expect(r.observability.replay_artifact_descriptor?.replayEligibility).toBe('PARTIAL');
    expect(r.observability.replay_artifact_descriptor?.affectedCognitiveDomains).toContain('INVENTORY');
    expect(r.observability.replay_artifact_descriptor?.affectedCognitiveDomains).toContain('OUTDOOR_ROUTE');
  });

  it('maps FULL_RESPONSE invalidation → NON_REPLAYABLE', () => {
    const r = baseResponse();
    (r.observability as any).replay_invalidation_decision = { scope: 'FULL_RESPONSE', reasonCodes: ['X'] };
    attachFullResponseReplayArtifactDescriptor(r);
    expect(r.observability.replay_artifact_descriptor?.replayEligibility).toBe('NON_REPLAYABLE');
    expect(r.observability.replay_artifact_descriptor?.replayConfidence.band).toBe('INVALID');
  });

  it('no-ops without replay_cache_provenance', () => {
    const r = baseResponse();
    delete (r.observability as any).replay_cache_provenance;
    attachFullResponseReplayArtifactDescriptor(r);
    expect(r.observability.replay_artifact_descriptor).toBeUndefined();
  });
});
