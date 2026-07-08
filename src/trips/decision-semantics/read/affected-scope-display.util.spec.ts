import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { AffectedScope } from '../types/decision-semantics.types';
import { parseScopeNarrative, projectAffectedScopeDisplays } from './affected-scope-display.util';

function issue(partial: Partial<FeasibilityIssueDto>): FeasibilityIssueDto {
  return {
    id: 'issue-1',
    priority: 'must_handle',
    category: 'transport',
    title: 't',
    message: 'm',
    affectedDays: [4],
    severity: 'high',
    issueKind: 'road_class',
    fromItemId: 'item-a',
    toItemId: 'item-b',
    anchors: {
      fromDayNumber: 4,
      toDayNumber: 4,
      fromPlaceLabel: '阿克雷里',
      toPlaceLabel: '米湖',
      travelDistanceMeters: 462_000,
      travelMinutes: 360,
    },
    proofs: [
      {
        entity: '阿克雷里 → 米湖',
        constraint: 'road_class',
        currentFact: 'f',
        evidenceSource: 'trip.conflicts',
        evidenceType: 'L3-PROOF',
        conclusion: 'c',
      },
    ],
    ...partial,
  };
}

describe('affected-scope-display.util', () => {
  it('parses route narrative without anchors', () => {
    expect(
      parseScopeNarrative(
        '第5天 · 米湖 → 迪尔餐厅（约 462 km）· 长距离行驶(>228km)，建议中途休息',
      ),
    ).toMatchObject({
      dayIndex: 5,
      fromPlace: '米湖',
      toPlace: '迪尔餐厅',
      distanceKm: 462,
    });
  });

  it('parses route without km distance suffix', () => {
    expect(
      parseScopeNarrative('第5天 · 米湖 → 迪尔餐厅 驾车约 366 分钟，建议拆分'),
    ).toMatchObject({
      dayIndex: 5,
      fromPlace: '米湖',
      toPlace: '迪尔餐厅',
      hint: '驾车约 366 分钟',
    });
  });

  it('projects DAY from explanation when issue has no anchors', () => {
    const displays = projectAffectedScopeDisplays(
      [
        {
          scopeType: 'DAY',
          scopeId: '5',
          impactType: 'DELAYED',
          severity: 'MEDIUM',
          explanation:
            '第5天 · 米湖 → 迪尔餐厅（约 462 km）· 长距离行驶(>228km)，建议中途休息',
        },
      ],
      {
        issue: issue({ anchors: undefined, fromItemId: undefined, toItemId: undefined }),
      },
    );
    expect(displays[0]).toMatchObject({
      label: '第 5 天 · 米湖 → 迪尔餐厅',
      secondaryLabel: '462km 自驾路段',
      dayIndex: 5,
      placeNames: ['米湖', '迪尔餐厅'],
    });
  });

  it('projects LEG with day and place labels', () => {
    const scopes: AffectedScope[] = [
      {
        scopeType: 'JOURNEY_LEG',
        scopeId: 'item-a->item-b',
        impactType: 'FATIGUE_INCREASED',
        severity: 'HIGH',
      },
    ];
    const displays = projectAffectedScopeDisplays(scopes, { issue: issue({}) });
    expect(displays[0]).toMatchObject({
      scopeType: 'JOURNEY_LEG',
      label: '第 4 天 · 阿克雷里 → 米湖',
      secondaryLabel: '462km 自驾路段',
      dayIndex: 4,
      placeNames: ['阿克雷里', '米湖'],
    });
  });

  it('projects DAY scope', () => {
    const displays = projectAffectedScopeDisplays(
      [{ scopeType: 'DAY', scopeId: '3', impactType: 'BLOCKED', severity: 'HIGH' }],
      { issue: issue({ affectedDays: [3] }) },
    );
    expect(displays[0].label).toBe('第 3 天');
    expect(displays[0].dayIndex).toBe(3);
  });

  it('merges DAY + ITINERARY_ITEM for same POI into single display row', () => {
    const scopes: AffectedScope[] = [
      {
        scopeType: 'DAY',
        scopeId: '1',
        impactType: 'BLOCKED',
        severity: 'HIGH',
        explanation: '第1天 · 蓝湖温泉：需要预约',
      },
      {
        scopeType: 'ITINERARY_ITEM',
        scopeId: 'item-blue-lagoon',
        impactType: 'BLOCKED',
        severity: 'HIGH',
        explanation: '第1天 · 蓝湖温泉：需要预约',
      },
    ];
    const displays = projectAffectedScopeDisplays(scopes, {
      issue: issue({
        affectedDays: [1],
        toItemId: 'item-blue-lagoon',
        title: '第1天 · 蓝湖温泉',
        message: '第1天 · 蓝湖温泉：需要预约',
        actionRequired: '需预约',
        anchors: undefined,
        fromItemId: undefined,
        proofs: [
          {
            itemId: 'item-blue-lagoon',
            placeLabel: '蓝湖温泉',
            entity: '蓝湖温泉',
            constraint: 'booking_confirmation',
            currentFact: '无预约凭证',
            evidenceSource: 'readiness.coverage',
            evidenceType: 'coverage-gap',
            conclusion: '需预约',
          },
        ],
      }),
      problemTitle: '第1天 · 蓝湖温泉：需要预约',
    });

    expect(displays).toHaveLength(1);
    expect(displays[0]).toMatchObject({
      scopeType: 'ITINERARY_ITEM',
      dayIndex: 1,
      label: '蓝湖温泉',
      secondaryLabel: '需要预约',
      placeNames: ['蓝湖温泉'],
    });
  });
});
