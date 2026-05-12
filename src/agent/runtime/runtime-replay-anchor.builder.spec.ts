import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { RUNTIME_UNIFIED_STATE_SCHEMA } from './runtime-state.types';
import {
  buildReplayPersistenceRecord,
  buildReplayPersistenceRecordFromFreshFinalize,
  sha256Hex,
} from './runtime-replay-anchor.builder';

describe('runtime-replay-anchor.builder', () => {
  it('sha256Hex is stable', () => {
    expect(sha256Hex('a')).toBe(sha256Hex('a'));
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('uses unified_state when runtime_materialization present', () => {
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const response = {
      observability: {
        runtime_materialization: {
          unified_state: {
            schema: RUNTIME_UNIFIED_STATE_SCHEMA,
            queryId: 'r1',
            phi: {
              queryId: 'r1',
              timeStep: 1,
              particles: [{ agentId: 'a', phi: [0.1, 0.2] }],
            },
            epsilon: null,
            causalKernel: null,
            kThetaFingerprint: 'fp',
            artifactRefs: ['art1'],
          },
        },
      },
    } as RouteAndRunResponseDto;

    const rec = buildReplayPersistenceRecordFromFreshFinalize({
      request,
      requestHash: 'deadbeef',
      response,
      createdAtMs: 12345,
    });
    expect(rec.admissionPath).toBe('FRESH_FINALIZE');
    expect(rec.queryId).toBe('r1');
    expect(rec.snapshotId).toHaveLength(64);
    expect(rec.artifactRefs).toContain('art1');
  });

  it('DEDUP_REPLAY snapshot id differs from FRESH_FINALIZE for same inputs', () => {
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const response = { observability: {} } as RouteAndRunResponseDto;
    const base = {
      request,
      requestHash: 'h',
      response,
      createdAtMs: 1000,
    };
    const fresh = buildReplayPersistenceRecord({ ...base, admissionPath: 'FRESH_FINALIZE' });
    const dedup = buildReplayPersistenceRecord({ ...base, admissionPath: 'DEDUP_REPLAY' });
    expect(fresh.snapshotId).not.toBe(dedup.snapshotId);
    expect(dedup.admissionPath).toBe('DEDUP_REPLAY');
  });

  it('falls back when no materialization', () => {
    const request = { request_id: 'r2', trip_id: 't9' } as RouteAndRunRequestDto;
    const response = {
      route: { route: 'LEGACY' },
      observability: {},
    } as RouteAndRunResponseDto;

    const rec = buildReplayPersistenceRecordFromFreshFinalize({
      request,
      requestHash: 'abc',
      response,
      createdAtMs: 99,
    });
    expect(rec.admissionPath).toBe('FRESH_FINALIZE');
    expect(rec.phiDigest).toHaveLength(64);
    expect(rec.artifactRefs).toContain('t9');
    expect(rec.artifactRefs).toContain('r2');
  });
});
