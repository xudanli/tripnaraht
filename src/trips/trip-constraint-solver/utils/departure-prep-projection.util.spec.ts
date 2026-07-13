import {
  collectDeparturePrepItems,
  isDeparturePrepFindingItem,
  isPlanFeasibilityFindingItem,
  computePreparationCompletion,
} from './departure-prep-projection.util';
import type { ReadinessFindingItem } from '../../readiness/types/readiness-findings.types';

function item(
  partial: Partial<ReadinessFindingItem> & Pick<ReadinessFindingItem, 'id' | 'category' | 'level'>,
): ReadinessFindingItem {
  return {
    severity: 'medium',
    message: 'test',
    ...partial,
  };
}

describe('departure-prep-projection.util', () => {
  it('excludes plan feasibility items', () => {
    expect(
      isPlanFeasibilityFindingItem(
        item({ id: 'a', category: 'entry_transit', level: 'must', issueKind: 'poi_access_blocked' }),
      ),
    ).toBe(true);
    expect(
      isDeparturePrepFindingItem(
        item({ id: 'b', category: 'entry_transit', level: 'blocker' }),
      ),
    ).toBe(true);
    expect(
      isDeparturePrepFindingItem(
        item({ id: 'c', category: 'schedule', level: 'must' }),
      ),
    ).toBe(false);
  });

  it('collects only departure prep from check result', () => {
    const items = collectDeparturePrepItems({
      findings: [
        {
          destinationId: 'IS',
          packId: 'pack.is',
          packVersion: '1',
          blockers: [item({ id: 'visa', category: 'entry_transit', level: 'blocker' })],
          must: [
            item({ id: 'drive', category: 'schedule', level: 'must', issueKind: 'daily_drive' }),
          ],
          should: [],
          optional: [],
          risks: [],
        },
      ],
      summary: {
        totalBlockers: 1,
        totalMust: 1,
        totalShould: 0,
        totalOptional: 0,
        totalRisks: 0,
      },
    });
    expect(items.map((i) => i.id)).toEqual(['visa']);
  });

  it('computes completion with checked and N/A', () => {
    const result = computePreparationCompletion({
      items: [
        item({ id: 'b1', category: 'entry_transit', level: 'blocker' }),
        item({ id: 'm1', category: 'gear_packing', level: 'must' }),
      ],
      checkedFindingIds: new Set(['m1']),
      notApplicableFindingIds: new Set(['b1']),
    });
    expect(result.openBlockerCount).toBe(0);
    expect(result.completionPercent).toBe(100);
  });
});
