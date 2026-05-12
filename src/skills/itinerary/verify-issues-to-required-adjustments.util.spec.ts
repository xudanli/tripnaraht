import { mapVerifyIssuesToRequiredAdjustments } from './verify-issues-to-required-adjustments.util';

describe('mapVerifyIssuesToRequiredAdjustments', () => {
  it('maps ERROR issues to actions and dedupes by type+item', () => {
    const adj = mapVerifyIssuesToRequiredAdjustments(
      [
        {
          type: 'FATIGUE_THRESHOLD_EXCEEDED',
          severity: 'ERROR',
          item_id: 'i1',
          message: 'too tired',
        },
        {
          type: 'FATIGUE_THRESHOLD_EXCEEDED',
          severity: 'ERROR',
          item_id: 'i1',
          message: 'dup',
        },
        {
          type: 'TIME_WINDOW_OVERLAP',
          severity: 'ERROR',
          item_id: 'i2',
          related_item_id: 'i0',
          message: 'overlap',
        },
      ],
      {},
    );
    expect(adj).toHaveLength(2);
    expect(adj[0].action).toBe('REDUCE_SCOPE_OR_ADD_EVIDENCE');
    expect(adj[0].target).toBe('i1');
    expect(adj[1].action).toBe('ADD_BUFFER');
    expect(adj[1].target).toBe('i2');
    expect(adj[1].buffer_anchor_item_id).toBe('i0');
    expect(adj[1].buffer_anchor_item_ids).toBeUndefined();
  });

  it('TIME_WINDOW_OVERLAP：同一后项多前项合并为一条 ADD_BUFFER（buffer_anchor_item_ids）', () => {
    const adj = mapVerifyIssuesToRequiredAdjustments(
      [
        {
          type: 'TIME_WINDOW_OVERLAP',
          severity: 'ERROR',
          item_id: 'c',
          related_item_id: 'a',
          message: 'a-c',
        },
        {
          type: 'TIME_WINDOW_OVERLAP',
          severity: 'ERROR',
          item_id: 'c',
          related_item_id: 'b',
          message: 'b-c',
        },
      ],
      {},
    );
    expect(adj).toHaveLength(1);
    expect(adj[0].action).toBe('ADD_BUFFER');
    expect(adj[0].target).toBe('c');
    expect(adj[0].buffer_anchor_item_ids?.length).toBe(2);
    expect(adj[0].buffer_anchor_item_ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('includes WARNING when includeWarnings', () => {
    const adj = mapVerifyIssuesToRequiredAdjustments(
      [{ type: 'TRANSFER_BUFFER_INSUFFICIENT', severity: 'WARNING', message: 'buf' }],
      { includeWarnings: true },
    );
    expect(adj).toHaveLength(1);
    expect(adj[0].action).toBe('ADD_BUFFER');
  });
});
