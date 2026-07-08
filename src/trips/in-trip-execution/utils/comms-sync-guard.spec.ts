import { assertCommsSyncMessagePayloadAllowed } from './comms-sync-guard.util';
import { buildCommsSummaryBullets } from './comms-summary.util';
import type { IntercomMessageDto } from '../types/in-trip-comms.types';

describe('comms-sync-guard.util', () => {
  it('rejects base64 audio in body', () => {
    expect(() =>
      assertCommsSyncMessagePayloadAllowed({
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        clientSeq: 1,
        type: 'voice',
        body: `data:audio/webm;base64,${'A'.repeat(600)}`,
        createdAt: new Date().toISOString(),
      }),
    ).toThrow(/COMMS_AUDIO_IN_JSON/);
  });

  it('allows text and transcript placeholders', () => {
    expect(() =>
      assertCommsSyncMessagePayloadAllowed({
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        clientSeq: 1,
        type: 'voice',
        body: '我们在停车场等你们',
        audio: { durationSec: 8, transcriptId: 'vt_abc' },
        createdAt: new Date().toISOString(),
      }),
    ).not.toThrow();
  });
});

describe('comms-summary.util', () => {
  const messages: IntercomMessageDto[] = [
    {
      id: 'm1',
      clientId: 'c1',
      tripId: 't1',
      senderId: 'u1',
      clientSeq: 1,
      type: 'text',
      body: '在停车场 B 汇合',
      createdAt: '2026-07-16T11:05:00.000Z',
      serverCreatedAt: '2026-07-16T11:05:01.000Z',
    },
    {
      id: 'm2',
      clientId: 'c2',
      tripId: 't1',
      senderId: 'u2',
      clientSeq: 2,
      type: 'text',
      body: '还有 5 分钟到',
      createdAt: '2026-07-16T11:10:00.000Z',
      serverCreatedAt: '2026-07-16T11:10:01.000Z',
    },
  ];

  it('builds time-stamped bullets', () => {
    const names = new Map([
      ['u1', '小明'],
      ['u2', '小王'],
    ]);
    const { bullets, sourceMessageIds } = buildCommsSummaryBullets(messages, 5, names);
    expect(bullets.length).toBe(2);
    expect(bullets[0]).toContain('11:05');
    expect(bullets[0]).toContain('小明');
    expect(sourceMessageIds).toEqual(['m1', 'm2']);
  });
});
