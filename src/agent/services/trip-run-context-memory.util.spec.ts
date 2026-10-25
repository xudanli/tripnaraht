import {
  buildTripRunContextMemoryMetadata,
  buildTripRunInputContextMeta,
  buildTripRunMemorySummaryMeta,
} from './trip-run-context-memory.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

describe('trip-run-context-memory.util', () => {
  it('builds input context preview from conversation_context', () => {
    const request = {
      request_id: 'req-1',
      message: 'hello',
      conversation_context: {
        context_type: 'active_trip_summary',
        locale: 'zh-CN',
        recent_messages: ['用户: a', '助手: b', '用户: c'.repeat(100)],
      },
      meta: { conversation_id: '11111111-1111-1111-1111-111111111111' },
    } as unknown as RouteAndRunRequestDto;

    const ctx = buildTripRunInputContextMeta(request);
    expect(ctx.context_type).toBe('active_trip_summary');
    expect(ctx.conversation_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(ctx.recent_message_count).toBe(3);
    expect(ctx.recent_messages_preview.length).toBe(3);
    expect(ctx.recent_messages_preview[2]!.endsWith('…')).toBe(true);
  });

  it('builds memory summary and metadata bundle', () => {
    const memory = {
      snapshotId: 'snap-1',
      snapshotVersion: 1,
      loadedAt: '2026-08-13T00:00:00.000Z',
      requestId: 'req-1',
      userId: 'u1',
      tripId: 't1',
      userProfile: { id: 'p' },
      userBasics: { nationality: 'CN' },
      activeTripState: { taskId: 'task' },
      recentDecisions: [{ id: 'd1' }, { id: 'd2' }],
      recentWorldDecisions: [],
      recentTripFeedbacks: [],
      failurePatterns: ['fatigue_overload:1'],
      decisionLedger: { nodes: [] },
      wishConstraintDigest: null,
      privateWishDigest: null,
      domainInfluenceDigest: { hasLead: true },
      observability: { layers: ['L0', 'L1'] },
    } as unknown as AgentMemoryContext;

    const summary = buildTripRunMemorySummaryMeta(memory);
    expect(summary.snapshot_id).toBe('snap-1');
    expect(summary.recent_decisions_count).toBe(2);
    expect(summary.layers).toEqual(['L0', 'L1']);

    const meta = buildTripRunContextMemoryMetadata(
      {
        request_id: 'req-1',
        message: 'x',
        conversation_context: { recent_messages: ['hi'] },
      } as RouteAndRunRequestDto,
      memory,
    );
    expect(meta.memory_snapshot_id).toBe('snap-1');
    expect((meta.input_context as any).recent_message_count).toBe(1);
  });
});
