import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import {
  computeConfidenceAtDedupReadTime,
  evaluateDedupConfidenceGate,
} from './confidence-dedup-gate.util';

function cachedDto(overrides: Partial<RouteAndRunResponseDto> = {}): RouteAndRunResponseDto {
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
      },
      replay_artifact_descriptor: {
        artifactType: 'FULL_RESPONSE',
        artifactIdentity: {
          artifactId: 'a'.repeat(64),
          material: {
            artifactType: 'FULL_RESPONSE',
            cognitionScope: 'X',
          },
        },
        replayEligibility: 'FULL',
        replayConfidence: {
          score: 1,
          band: 'HIGH',
          factors: {
            eligibilityPrior: 1,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
        provenance: { generatedAt: Date.now() },
      },
    },
    ...overrides,
  } as RouteAndRunResponseDto;
}

function minimalRequest(): RouteAndRunRequestDto {
  return {
    request_id: 'req',
    user_id: 'u',
    trip_id: 't',
    message: 'hello',
  } as RouteAndRunRequestDto;
}

describe('confidence-dedup-gate.util', () => {
  const prevGate = process.env.CONFIDENCE_DEDUP_GATE_DISABLED;

  afterEach(() => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = prevGate;
  });

  it('HIGH + fresh → SERVE_DEDUP', () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = undefined;
    const c = cachedDto();
    expect(evaluateDedupConfidenceGate(c, minimalRequest()).action).toBe('SERVE_DEDUP');
  });

  it('NO provenance → BYPASS', () => {
    const c = cachedDto();
    delete (c.observability as any).replay_cache_provenance;
    expect(evaluateDedupConfidenceGate(c, minimalRequest()).action).toBe('BYPASS_DEDUP_FORCE_FRESH');
  });

  it('INVALID eligibility → BYPASS', () => {
    const c = cachedDto();
    (c.observability as any).replay_artifact_descriptor.replayEligibility = 'NON_REPLAYABLE';
    expect(evaluateDedupConfidenceGate(c, minimalRequest()).action).toBe('BYPASS_DEDUP_FORCE_FRESH');
  });

  it('gate disabled env → SERVE_DEDUP even when INVALID', () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    const c = cachedDto();
    (c.observability as any).replay_artifact_descriptor.replayEligibility = 'NON_REPLAYABLE';
    expect(evaluateDedupConfidenceGate(c, minimalRequest()).action).toBe('SERVE_DEDUP');
  });

  it('computeConfidenceAtDedupReadTime rescoring uses nowMs', () => {
    const c = cachedDto();
    (c.observability as any).replay_cache_provenance.generatedAt = Date.now() - 10 * 60 * 60 * 1000;
    const confNow = computeConfidenceAtDedupReadTime(c, Date.now());
    const confThen = computeConfidenceAtDedupReadTime(
      c,
      (c.observability as any).replay_cache_provenance.generatedAt + 1000,
    );
    expect(confThen!.score).toBeGreaterThan(confNow!.score);
  });
});
