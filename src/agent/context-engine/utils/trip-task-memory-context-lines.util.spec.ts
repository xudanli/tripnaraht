import { formatLatestReplanLineageLine } from './trip-task-memory-context-lines.util';

describe('trip-task-memory-context-lines.util', () => {
  it('returns undefined when no replan_lineage', () => {
    expect(formatLatestReplanLineageLine(undefined)).toBeUndefined();
    expect(formatLatestReplanLineageLine([])).toBeUndefined();
    expect(formatLatestReplanLineageLine([{ at: 't', event: 'writeback', payload: {} }])).toBeUndefined();
  });

  it('uses latest replan_lineage from tail', () => {
    const line = formatLatestReplanLineageLine([
      { at: 'a', event: 'replan_lineage', payload: { previous_plan_version: 1, new_plan_version: 2 } },
      { at: 'b', event: 'replan_lineage', payload: { previous_plan_version: 9, new_plan_version: 10, requestId: 'r-z' } },
    ]);
    expect(line).toContain('上一版v=9');
    expect(line).toContain('本轮v=10');
    expect(line).toContain('req=r-z');
  });

  it('truncates snapshot hash', () => {
    const line = formatLatestReplanLineageLine([
      {
        at: 't',
        event: 'replan_lineage',
        payload: { previous_world_snapshot_hash: 'sha256:' + 'x'.repeat(40) },
      },
    ]);
    expect(line).toMatch(/^Replan继承 快照=sha256:x{13}…$/);
  });
});
