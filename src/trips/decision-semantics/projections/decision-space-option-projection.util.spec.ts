import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { DecisionOption } from '../types/decision-semantics.types';
import { normalizeRepairOptionTradeoffs } from '../normalizers/tradeoff.normalizer';
import { projectDecisionOptionForSpaceView } from './decision-space-option-projection.util';

function driveIssue(): FeasibilityIssueDto {
  return {
    id: 'issue-drive-day2',
    priority: 'must_handle',
    category: 'transport',
    title: 'Day 2 驾驶超时',
    message: '第 2 天 · Patreksfjörður → Ísafjörður（约 462 km）· 驾车约 402 分钟',
    severity: 'high',
    issueKind: 'daily_drive',
    affectedDays: [2],
    anchors: {
      fromPlaceLabel: 'Patreksfjörður',
      toPlaceLabel: 'Ísafjörður',
      travelMinutes: 402,
      shortfallMinutes: 204,
    },
  };
}

function lodgingRepairOption(): RepairOption {
  return {
    id: 'opt_change_day2_lodge',
    title: '更换 Day 2 住宿',
    description: '将住宿改到 Ísafjörður，缩短驾驶距离。',
    impact: 'high',
    actionType: 'relocate_lodging',
    payload: {
      dayNumber: 2,
      expectedDriveReductionMinutes: 204,
      suggestedLodgingLabel: 'Dýrafjörður',
    },
  };
}

describe('decision-space-option-projection.util', () => {
  it('projects relocate_lodging option to Decision Space tradeoffs contract', () => {
    const issue = driveIssue();
    const repair = lodgingRepairOption();
    const base: DecisionOption = {
      id: repair.id,
      problemId: 'dp_id:travel-buffer:1',
      type: 'REPAIR',
      title: repair.title,
      description: repair.description ?? '',
      source: 'CONSTRAINT_REPAIR',
      resolves: [],
      tradeoffs: normalizeRepairOptionTradeoffs(repair, issue),
      executable: true,
      requiresConfirmation: true,
    };

    const projected = projectDecisionOptionForSpaceView(base, { issue, repairOption: repair });

    expect(projected.routePreview?.placeNames).toEqual([
      'Patreksfjörður',
      'Dýrafjörður',
      'Ísafjörður',
    ]);

    const flex = projected.tradeoffs.find((t) => t.dimension === 'FLEXIBILITY');
    expect(flex).toMatchObject({ direction: 'IMPROVE', unit: 'PERCENT' });
    expect(typeof flex?.value).toBe('number');

    const time = projected.tradeoffs.find((t) => t.dimension === 'TIME');
    expect(time).toMatchObject({
      direction: 'IMPROVE',
      value: 198,
      unit: 'MINUTE',
    });
    expect(time?.explanation).toMatch(/原方案 6h42m → 调整后 3h18m/);

    const cost = projected.tradeoffs.find((t) => t.dimension === 'COST');
    expect(cost).toMatchObject({ direction: 'WORSEN', unit: 'CURRENCY' });
    expect(typeof cost?.value).toBe('number');

    const poi = projected.tradeoffs.find((t) => t.dimension === 'POI_COVERAGE');
    expect(poi).toMatchObject({
      unit: 'PERCENT',
      baselineValue: 95,
    });

    const numericCount = projected.tradeoffs.filter(
      (t) => typeof t.value === 'number' && t.unit != null,
    ).length;
    expect(numericCount).toBeGreaterThanOrEqual(2);

    for (const row of projected.tradeoffs) {
      expect(typeof row.contextualNarrative).toBe('string');
      expect(row.contextualNarrative!.length).toBeGreaterThan(10);
    }
  });
});
