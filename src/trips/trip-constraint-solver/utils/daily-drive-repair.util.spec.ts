import {
  buildDailyDriveRepairOptionsResponse,
  resolveEffectiveRepairOptions,
} from './daily-drive-repair.util';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

function dailyDriveIssue(): FeasibilityIssueDto {
  return {
    id: 'conflict-daily-drive-day-2',
    priority: 'must_handle',
    category: 'transport',
    title: '每日驾驶上限',
    message: 'Day 2 超出 4h 上限',
    affectedDays: [2],
    severity: 'high',
    issueKind: 'daily_drive',
    anchors: { travelMinutes: 320, shortfallMinutes: 80 },
  };
}

describe('daily-drive-repair.util', () => {
  it('synthesizes repair options when API returns none', () => {
    const resolved = resolveEffectiveRepairOptions({
      tripId: 'trip-1',
      primaryIssue: dailyDriveIssue(),
    });
    expect(resolved?.options.length).toBeGreaterThanOrEqual(2);
    expect(resolved?.options[0].id).toContain('lodging');
    expect(resolved?.options[0].cost).toBeGreaterThan(0);
  });

  it('buildDailyDriveRepairOptionsResponse includes netImpactMinutes metadata', () => {
    const resp = buildDailyDriveRepairOptionsResponse('trip-1', dailyDriveIssue());
    expect(resp.options[0].metadata?.netImpactMinutes).toBe(-80);
  });

  it('includes remove_poi when removable item anchor is present', () => {
    const issue = {
      ...dailyDriveIssue(),
      anchors: {
        ...dailyDriveIssue().anchors,
        removableItemId: 'item-far',
        removableItemSavedMinutes: 95,
        removableItemLabel: '远端瀑布',
      },
      uiHints: {
        deepLink: { tab: 'schedule' as const, dayIndex: 1, highlightItemIds: ['item-far'] },
      },
    };
    const resp = buildDailyDriveRepairOptionsResponse('trip-1', issue);
    const remove = resp.options.find((o) => o.actionType === 'remove_poi');
    expect(remove?.payload?.savedMinutes).toBe(95);
    expect(remove?.id).toBe('remove_poi_item-far');
  });
});
