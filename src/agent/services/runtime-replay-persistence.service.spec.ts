import { RuntimeReplayPersistenceService } from './runtime-replay-persistence.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { RUNTIME_PERSISTENCE_SCHEMA } from '../runtime/runtime-persistence.types';

describe('RuntimeReplayPersistenceService', () => {
  const prev = process.env.RUNTIME_REPLAY_PERSISTENCE;

  afterEach(() => {
    if (prev === undefined) delete process.env.RUNTIME_REPLAY_PERSISTENCE;
    else process.env.RUNTIME_REPLAY_PERSISTENCE = prev;
    jest.restoreAllMocks();
  });

  it('no echo when disabled', () => {
    process.env.RUNTIME_REPLAY_PERSISTENCE = '0';
    const prisma = { agentRuntimeReplayAnchor: { create: jest.fn() } };
    const svc = new RuntimeReplayPersistenceService(prisma as any);
    const response = { observability: { latency_ms: 1 } } as RouteAndRunResponseDto;
    const req = { request_id: 'r1' } as RouteAndRunRequestDto;
    expect(
      svc.attachReplayPersistenceEcho({
        request: req,
        requestHash: 'h',
        response,
        admissionPath: 'FRESH_FINALIZE',
      }),
    ).toBeNull();
    expect((response.observability as Record<string, unknown>).runtime_replay_persistence).toBeUndefined();
  });

  it('attach echo then persist; strip echo on DB failure', async () => {
    process.env.RUNTIME_REPLAY_PERSISTENCE = '1';
    const prisma = {
      agentRuntimeReplayAnchor: {
        upsert: jest.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const svc = new RuntimeReplayPersistenceService(prisma as any);
    const response = { observability: { latency_ms: 1 } } as RouteAndRunResponseDto;
    const req = { request_id: 'r1' } as RouteAndRunRequestDto;

    await svc.persistDedupReplayAnchor({
      request: req,
      requestHash: 'deadbeef',
      response,
    });

    expect(prisma.agentRuntimeReplayAnchor.upsert).toHaveBeenCalledTimes(1);
    expect((response.observability as Record<string, unknown>).runtime_replay_persistence).toBeUndefined();
  });

  it('keeps echo when DB succeeds', async () => {
    process.env.RUNTIME_REPLAY_PERSISTENCE = '1';
    const prisma = {
      agentRuntimeReplayAnchor: {
        upsert: jest.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' }),
      },
    };
    const svc = new RuntimeReplayPersistenceService(prisma as any);
    const response = { observability: { latency_ms: 1 } } as RouteAndRunResponseDto;
    const req = { request_id: 'r1' } as RouteAndRunRequestDto;

    await svc.persistFreshReplayAnchor({
      request: req,
      requestHash: 'abc',
      response,
    });

    const echo = (response.observability as Record<string, unknown>).runtime_replay_persistence as {
      schema: string;
      admission_path: string;
      dedup_request_hash: string;
    };
    expect(echo.schema).toBe(RUNTIME_PERSISTENCE_SCHEMA);
    expect(echo.admission_path).toBe('FRESH_FINALIZE');
    expect(echo.dedup_request_hash).toBe('abc');
    expect(
      (response.observability as Record<string, unknown>).runtime_replay_persistence as {
        anchor_row_id?: string;
      },
    ).toMatchObject({
      anchor_row_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(prisma.agentRuntimeReplayAnchor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupRequestHash: 'abc',
          admissionPath: 'FRESH_FINALIZE',
        }),
      }),
    );
  });

  it('listAnchorsByQueryId maps rows', async () => {
    process.env.RUNTIME_REPLAY_PERSISTENCE = '1';
    const prisma = {
      agentRuntimeReplayAnchor: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'u1',
            snapshotId: 's1',
            queryId: 'q1',
            admissionPath: 'DEDUP_REPLAY',
            dedupRequestHash: 'hh',
            phiDigest: 'pd',
            certificateDigest: null,
            artifactRefs: ['a'],
            schemaVersion: 'runtime/persistence/v1',
            createdAtMs: BigInt(10),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const svc = new RuntimeReplayPersistenceService(prisma as any);
    const rows = await svc.listAnchorsByQueryId('q1', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].snapshot_id).toBe('s1');
    expect(rows[0].created_at_ms).toBe('10');
    expect(prisma.agentRuntimeReplayAnchor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { queryId: 'q1' }, take: 10 }),
    );
  });

  it('findAnchorBySnapshotId uses unique lookup', async () => {
    const prisma = {
      agentRuntimeReplayAnchor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          snapshotId: 'snap1',
          queryId: 'q1',
          admissionPath: 'FRESH_FINALIZE',
          dedupRequestHash: 'h',
          phiDigest: 'pd',
          certificateDigest: null,
          artifactRefs: [],
          schemaVersion: 'runtime/persistence/v1',
          createdAtMs: BigInt(1),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    const svc = new RuntimeReplayPersistenceService(prisma as any);
    const row = await svc.findAnchorBySnapshotId('snap1');
    expect(row?.snapshot_id).toBe('snap1');
    expect(prisma.agentRuntimeReplayAnchor.findUnique).toHaveBeenCalledWith({
      where: { snapshotId: 'snap1' },
    });
  });
});
