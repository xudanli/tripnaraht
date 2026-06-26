import {
  buildTripPrivateAnonSummaryText,
  partitionWishItemsForAgentContext,
} from './wish-agent-partition.util';
import type { TripWishItemRecord } from '../types/trip-wish.types';

function wish(partial: Partial<TripWishItemRecord> & Pick<TripWishItemRecord, 'userId' | 'visibility' | 'text'>): TripWishItemRecord {
  return {
    id: partial.id ?? 'w1',
    tripId: 't1',
    category: 'activities',
    importance: 5,
    inputMode: 'free_text',
    sourceRef: null,
    agentEligible: true,
    structuredHints: null,
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...partial,
  };
}

describe('partitionWishItemsForAgentContext', () => {
  it('拆分本人私密、他人私密与团队愿望', () => {
    const items = [
      wish({ id: 'a', userId: 'u1', visibility: 'private', text: '我的极光' }),
      wish({ id: 'b', userId: 'u2', visibility: 'private', text: '同伴温泉' }),
      wish({ id: 'c', userId: 'u2', visibility: 'signed', text: '冰河湖' }),
      wish({ id: 'd', userId: 'u1', visibility: 'private', text: '备忘', agentEligible: false }),
    ];
    const p = partitionWishItemsForAgentContext(items, 'u1');
    expect(p.minePrivate.map((i) => i.id)).toEqual(['a']);
    expect(p.othersPrivate.map((i) => i.id)).toEqual(['b']);
    expect(p.team.map((i) => i.id)).toEqual(['c']);
  });
});

describe('buildTripPrivateAnonSummaryText', () => {
  it('匿名摘要不含 userId', () => {
    const text = buildTripPrivateAnonSummaryText([
      wish({ userId: 'u2', visibility: 'private', text: '同伴温泉' }),
    ]);
    expect(text).toContain('某位成员');
    expect(text).toContain('同伴温泉');
    expect(text).not.toContain('u2');
  });
});
