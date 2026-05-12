import { RevisionNarratorService } from './revision-narrator.service';

describe('RevisionNarratorService (impact mapping)', () => {
  const narrator = new RevisionNarratorService();

  it('getImpactSummary for ROLLBACK uses restore phrasing with bracketed names', () => {
    const snapshot = {
      days: [
        {
          items: [
            { id: 'm1', name: '大英博物馆' },
            { id: 'd1', name: '柯芬园晚餐' },
          ],
        },
      ],
    };
    const s = narrator.getImpactSummary({
      kind: 'ROLLBACK',
      interrupted_items: [
        { item_id: 'm1', field: 'start_time' },
        { item_id: 'd1', field: 'start_time' },
      ],
      snapshot,
    });
    expect(s).toContain('[大英博物馆]');
    expect(s).toContain('[柯芬园晚餐]');
    expect(s).toContain('此次回滚恢复了');
    expect(s).toContain('准点状态');
  });

  it('enrichInterruptedItems adds display_name from context.station', () => {
    const snapshot = {
      days: [{ items: [{ id: 'x', context: { station: 'Museum Wing' } }] }],
    };
    const out = narrator.enrichInterruptedItems([{ item_id: 'x', field: 'start_time' }], snapshot);
    expect(out[0].display_name).toBe('Museum Wing');
  });
});
