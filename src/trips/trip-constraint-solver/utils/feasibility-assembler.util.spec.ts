import {
  assembleFeasibilityReport,
  computeCanStartExecute,
  mapReadinessFindingPriority,
  resolveFeasibilityVerdict,
} from './feasibility-assembler.util';
import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';

describe('feasibility-assembler', () => {
  const baseTrip = {
    id: 'trip-1',
    name: '冰岛环岛',
    startDate: new Date('2026-06-20'),
    endDate: new Date('2026-06-29'),
    metadata: {},
  };

  it('maps UNKNOWN when never validated', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd1', dayNumber: 1 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 26,
          evidenceCoverage: 59,
          scheduleFeasibility: 25,
          transportCertainty: 0,
          safetyRisk: 0,
          buffers: 35,
        },
        findings: [],
        risks: [],
        summary: {
          totalFindings: 0,
          blockers: 0,
          must: 0,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: new Date().toISOString(),
      },
      conflicts: [],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: null,
    });
    expect(report.verdict.status).toBe('UNKNOWN');
    expect(report.dimensions).toHaveLength(8);
    expect(report.dimensions.map((d) => d.key)).toEqual([
      'schedule',
      'transport',
      'booking',
      'environment',
      'access_capacity',
      'experience_expectation',
      'team_fit',
      'itinerary_completeness',
    ]);
    expect(report.gateExecute).toEqual({ blocked: false, reasons: [] });
    expect(report.isStale).toBe(false);
  });

  it('maps STALE when trip revision diverges', () => {
    const verdict = resolveFeasibilityVerdict({
      hasValidation: true,
      isStale: true,
      summary: { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, blockers: 0 },
    });
    expect(verdict.status).toBe('STALE');
  });

  it('maps NOT_EXECUTABLE when blockers present', () => {
    const verdict = resolveFeasibilityVerdict({
      hasValidation: true,
      isStale: false,
      summary: { mustHandle: 2, suggestAdjust: 0, pendingConfirm: 0, blockers: 2 },
      gateResult: 'BLOCK',
    });
    expect(verdict.status).toBe('NOT_EXECUTABLE');
    expect(verdict.headline).not.toContain('BLOCK');
  });

  it('mapReadinessFindingPriority: blocker is must_handle; high severity must stays suggest_adjust', () => {
    expect(
      mapReadinessFindingPriority({
        id: 'coverage-gap:g1',
        type: 'blocker',
        category: 'evidence',
        message: '缺少关键证据',
        severity: 'high',
      }),
    ).toBe('must_handle');
    expect(
      mapReadinessFindingPriority({
        id: 'schedule-busy-day-2',
        type: 'must',
        category: 'schedule',
        message: '第2天安排 8 个景点，行程过满',
        severity: 'high',
      }),
    ).toBe('suggest_adjust');
  });

  it('validated report with only high-severity must findings is ADJUST_REQUIRED not NOT_EXECUTABLE', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd1', dayNumber: 1 }, { id: 'd2', dayNumber: 2 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 55,
          evidenceCoverage: 70,
          scheduleFeasibility: 45,
          transportCertainty: 60,
          safetyRisk: 70,
          buffers: 40,
        },
        findings: [
          {
            id: 'schedule-busy-day-2',
            type: 'must',
            category: 'schedule',
            message: '第2天安排 8 个景点，行程过满',
            severity: 'high',
            affectedDays: [2],
          },
        ],
        risks: [],
        summary: {
          totalFindings: 1,
          blockers: 0,
          must: 1,
          should: 0,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: new Date().toISOString(),
      },
      conflicts: [],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: {
        verifiedAt: '2026-06-20T00:00:00.000Z',
        verifiedForTripVersion: '12',
      },
    });
    expect(report.issues[0].priority).toBe('suggest_adjust');
    expect(report.summary.mustHandle).toBe(0);
    expect(report.summary.suggestAdjust).toBe(1);
    expect(report.verdict.status).toBe('ADJUST_REQUIRED');
    expect(computeCanStartExecute({
      hasValidation: true,
      isStale: false,
      verdictStatus: report.verdict.status,
      gateExecute: report.gateExecute,
    })).toBe(false);
  });

  it('attaches coverage map evidence proofs to readiness findings', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd1', dayNumber: 1 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 42,
          evidenceCoverage: 60,
          scheduleFeasibility: 40,
          transportCertainty: 30,
          safetyRisk: 50,
          buffers: 25,
        },
        findings: [
          {
            id: 'coverage-gap:gap-1',
            type: 'blocker',
            category: 'logistics',
            message: '第1天路段缺少道路状态证据',
            severity: 'high',
            affectedDays: [1],
            actionRequired: '补充道路证据',
          },
        ],
        risks: [],
        summary: {
          totalFindings: 1,
          blockers: 1,
          must: 0,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 1,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      coverage: {
        tripId: 'trip-1',
        bounds: { north: 1, south: 0, east: 1, west: 0 },
        center: { lat: 0, lng: 0 },
        zoom: 8,
        pois: [
          {
            id: 'poi-1',
            day: 1,
            order: 1,
            name: '黄金瀑布',
            type: 'attraction',
            coordinates: { lat: 64, lng: -20 },
            coverageStatus: 'covered',
            evidenceCount: 2,
            evidenceTypes: ['weather', 'road_closure'],
            metadata: {
              weatherFetchedAt: '2026-06-18T00:00:00.000Z',
              roadStatusFetchedAt: '2026-06-18T01:00:00.000Z',
            },
          },
        ],
        segments: [],
        gaps: [
          {
            id: 'gap-1',
            type: 'segment',
            relatedId: 'segment-1',
            coordinates: { lat: 64, lng: -20 },
            severity: 'high',
            message: '第1天路段缺少道路状态证据',
            missingEvidence: ['road_closure'],
            evidenceStatus: [
              {
                type: 'road_closure',
                status: 'missing',
                source: 'readiness.coverage-map',
              },
            ],
            affectedDays: [1],
          },
        ],
        summary: {
          totalPois: 1,
          coveredPois: 1,
          partialPois: 0,
          uncoveredPois: 0,
          totalSegments: 0,
          coveredSegments: 0,
          warningSegments: 0,
          blockedSegments: 0,
          totalGaps: 1,
          coverageRate: 0.5,
        },
        evidenceStatusSummary: {
          total: 3,
          fetched: 2,
          missing: 1,
          fetching: 0,
          failed: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      conflicts: [],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: { verifiedAt: '2026-06-20T00:00:00.000Z', verifiedForTripVersion: '12' },
    });

    expect(report.issues[0].proofs?.some((p) => p.evidenceType === 'road_closure')).toBe(true);
    expect(report.issues[0].proofs?.some((p) => p.currentFact === '道路状态证据未获取')).toBe(true);
    expect(report.issues[0].proofs?.length).toBeLessThanOrEqual(4);
  });

  it('keeps booking gaps as booking issues with reservation and opening-hours proofs', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd1', dayNumber: 1 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 62,
          evidenceCoverage: 65,
          scheduleFeasibility: 80,
          transportCertainty: 70,
          safetyRisk: 75,
          buffers: 60,
        },
        findings: [
          {
            id: 'coverage-gap:gap-booking',
            type: 'must',
            category: 'booking',
            message: '第1天 · 蓝湖温泉：缺少证据覆盖',
            severity: 'medium',
            affectedDays: [1],
            actionRequired: '补充: booking_confirmation',
          },
        ],
        risks: [],
        summary: {
          totalFindings: 1,
          blockers: 0,
          must: 1,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 0,
          mediumRisks: 1,
          lowRisks: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      coverage: {
        tripId: 'trip-1',
        bounds: { north: 1, south: 0, east: 1, west: 0 },
        center: { lat: 0, lng: 0 },
        zoom: 8,
        pois: [
          {
            id: 'poi-blue-lagoon',
            itemId: 'item-blue-lagoon',
            day: 1,
            order: 1,
            name: '蓝湖温泉',
            type: 'hot_spring',
            startTime: '2026-06-20T08:00:00.000Z',
            coordinates: { lat: 64, lng: -22 },
            coverageStatus: 'partial',
            evidenceCount: 1,
            evidenceTypes: ['opening_hours'],
            missingEvidence: ['booking_confirmation'],
            metadata: {
              requiresReservation: true,
              reservation: { required: true, leadTime: 'P3D' },
              openingHoursUpdatedAt: '2026-06-19T00:00:00.000Z',
              openingHoursSource: 'official-site',
            },
          },
        ],
        segments: [],
        gaps: [
          {
            id: 'gap-booking',
            type: 'poi',
            relatedId: 'poi-blue-lagoon',
            coordinates: { lat: 64, lng: -22 },
            severity: 'medium',
            message: '第1天 · 蓝湖温泉：缺少证据覆盖',
            missingEvidence: ['booking_confirmation'],
            evidenceStatus: [
              {
                type: 'booking_confirmation',
                status: 'missing',
                source: 'readiness.coverage-map',
              },
              {
                type: 'opening_hours',
                status: 'fetched',
                source: 'official-site',
                lastUpdated: '2026-06-19T00:00:00.000Z',
              },
            ],
            affectedDays: [1],
            affectedPois: ['poi-blue-lagoon'],
          },
        ],
        summary: {
          totalPois: 1,
          coveredPois: 0,
          partialPois: 1,
          uncoveredPois: 0,
          totalSegments: 0,
          coveredSegments: 0,
          warningSegments: 0,
          blockedSegments: 0,
          totalGaps: 1,
          coverageRate: 0.5,
        },
        evidenceStatusSummary: {
          total: 2,
          fetched: 1,
          missing: 1,
          fetching: 0,
          failed: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      conflicts: [],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: { verifiedAt: '2026-06-20T00:00:00.000Z', verifiedForTripVersion: '12' },
    });

    expect(report.issues[0].category).toBe('booking');
    expect(report.issues[0].proofs?.some((p) => p.evidenceType === 'booking_confirmation')).toBe(true);
    expect(report.issues[0].proofs?.some((p) => p.evidenceType === 'opening_hours')).toBe(true);
    const bookingProof = report.issues[0].proofs?.find((p) => p.evidenceType === 'booking_confirmation');
    expect(bookingProof).toMatchObject({
      itemId: 'item-blue-lagoon',
      placeLabel: '蓝湖温泉',
      ruleId: 'booking.advance_reservation.poi',
    });
    expect(bookingProof?.repairOptions?.map((option) => option.actionType)).toEqual([
      'adjust_time',
      'replace_poi',
    ]);
    expect(bookingProof?.planBOptions?.map((option) => option.actionType)).toEqual([
      'adjust_time',
      'replace_poi',
    ]);
    expect(bookingProof?.repairOptions?.[0].payload).toMatchObject({
      itemId: 'item-blue-lagoon',
      field: 'startTime',
      suggestedValue: '2026-06-20T10:00:00.000Z',
    });
  });

  it('maps inter-day travel conflicts to anchored feasibility issues', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [
        { id: 'd1', dayNumber: 1 },
        { id: 'd2', dayNumber: 2 },
      ],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 70,
          evidenceCoverage: 90,
          scheduleFeasibility: 60,
          transportCertainty: 55,
          safetyRisk: 90,
          buffers: 60,
        },
        findings: [],
        risks: [],
        summary: {
          totalFindings: 0,
          blockers: 0,
          must: 0,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      conflicts: [
        {
          id: 'inter-day-travel-item-a-item-b',
          type: ConflictType.TRANSPORT_INSUFFICIENT,
          severity: ConflictSeverity.HIGH,
          title: '跨天交通时间不足',
          description: 'Day 1 到 Day 2 交通时间不足',
          affectedDays: ['1', '2'],
          affectedItemIds: ['item-a', 'item-b'],
          fromItemId: 'item-a',
          toItemId: 'item-b',
          fromTime: '2026-06-21T23:00:00.000+08:00',
          toTime: '2026-06-22T06:00:00.000+08:00',
          departAt: '2026-06-21T23:00:00.000+08:00',
          arriveAt: '2026-06-22T07:40:00.000+08:00',
          activityStartAt: '2026-06-22T06:00:00.000+08:00',
          issueKind: 'inter_day_travel',
          fromDayNumber: 1,
          toDayNumber: 2,
          fromPlaceLabel: '钻石沙滩',
          toPlaceLabel: '蓝湖温泉',
          travelMode: 'DRIVING',
          travelMinutes: 520,
          travelTimeMinutes: 520,
          travelDistanceMeters: 304000,
          availableMinutes: 420,
          gapMinutes: -100,
          shortfallMinutes: 115,
          isStartTooEarly: true,
          timingSource: 'computed',
          suggestedTime: '2026-06-22T07:55:00.000+08:00',
        },
      ],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: { verifiedAt: '2026-06-20T00:00:00.000Z', verifiedForTripVersion: '12' },
    });

    expect(report.issues[0]).toMatchObject({
      issueKind: 'inter_day_travel',
      fromItemId: 'item-a',
      toItemId: 'item-b',
      anchors: {
        fromItemId: 'item-a',
        toItemId: 'item-b',
        fromDayNumber: 1,
        toDayNumber: 2,
        fromPlaceLabel: '钻石沙滩',
        toPlaceLabel: '蓝湖温泉',
        travelMinutes: 520,
        travelDistanceMeters: 304000,
        gapMinutes: -100,
        shortfallMinutes: 115,
        isStartTooEarly: true,
        suggestedTime: '2026-06-22T07:55:00.000+08:00',
      },
      uiHints: {
        primaryAction: 'add_buffer',
        deepLink: {
          tab: 'schedule',
          dayIndex: 1,
          highlightItemIds: ['item-a', 'item-b'],
        },
      },
    });
    expect(report.issues[0].proofs?.map((proof) => proof.ruleId)).toEqual([
      'schedule.travel_time.route',
      'schedule.travel_time.timing',
    ]);
    const timingProof = report.issues[0].proofs?.find(
      (proof) => proof.ruleId === 'schedule.travel_time.timing',
    );
    expect(timingProof).toMatchObject({
      itemId: 'item-b',
      fromItemId: 'item-a',
      toItemId: 'item-b',
      placeLabel: '蓝湖温泉',
    });
    expect(timingProof?.repairOptions?.map((o) => o.actionType)).toEqual([
      'insert_rest_day',
      'add_buffer',
      'add_buffer',
      'add_buffer_minutes',
      'shift_departure',
      'adjust_time',
      'move_to_day',
    ]);
    expect(timingProof?.planBOptions?.[0].actionType).toBe('insert_rest_day');
    expect(report.dayTimeline[0].issueIds).toContain(report.issues[0].id);
    expect(report.dayTimeline[1].issueIds).toContain(report.issues[0].id);
  });

  it('preserves ISO offset when formatting proof-level repair labels', () => {
    const report = assembleFeasibilityReport({
      trip: baseTrip,
      tripDays: [{ id: 'd2', dayNumber: 2 }],
      readiness: {
        tripId: 'trip-1',
        score: {
          overall: 70,
          evidenceCoverage: 90,
          scheduleFeasibility: 60,
          transportCertainty: 55,
          safetyRisk: 90,
          buffers: 60,
        },
        findings: [],
        risks: [],
        summary: {
          totalFindings: 0,
          blockers: 0,
          must: 0,
          should: 0,
          warnings: 0,
          suggestions: 0,
          highRisks: 0,
          mediumRisks: 0,
          lowRisks: 0,
        },
        calculatedAt: '2026-06-20T00:00:00.000Z',
      },
      conflicts: [
        {
          id: 'same-day-travel-item-a-item-b',
          type: ConflictType.TRANSPORT_INSUFFICIENT,
          severity: ConflictSeverity.MEDIUM,
          title: '交通缓冲偏紧',
          description: 'Day 2 交通缓冲偏紧',
          affectedDays: ['2'],
          affectedItemIds: ['item-a', 'item-b'],
          fromItemId: 'item-a',
          toItemId: 'item-b',
          fromTime: '2026-06-22T09:00:00.000Z',
          toTime: '2026-06-22T10:55:00.000Z',
          departAt: '2026-06-22T09:00:00.000Z',
          arriveAt: '2026-06-22T10:54:00.000Z',
          activityStartAt: '2026-06-22T10:55:00.000Z',
          issueKind: 'same_day_travel',
          fromDayNumber: 2,
          toDayNumber: 2,
          fromPlaceLabel: '盖歇尔间歇泉',
          toPlaceLabel: '斯科加瀑布',
          travelMode: 'DRIVING',
          travelMinutes: 114,
          travelTimeMinutes: 114,
          travelDistanceMeters: 114000,
          availableMinutes: 115,
          gapMinutes: 1,
          shortfallMinutes: 0,
          isStartTooEarly: false,
          timingSource: 'computed',
          suggestedTime: '2026-06-22T10:59:00.000Z',
        },
      ],
      revision: { revision: 12, revisionLabel: 'V12' },
      snapshot: { verifiedAt: '2026-06-20T00:00:00.000Z', verifiedForTripVersion: '12' },
    });

    const timingProof = report.issues[0].proofs?.find(
      (proof) => proof.ruleId === 'schedule.travel_time.timing',
    );
    expect(timingProof?.currentFact).toContain('活动开始 10:55');
    expect(timingProof?.planBOptions?.[0].label).toContain('10:59');
    expect(timingProof?.planBOptions?.[0].label).not.toContain('18:59');
  });

  it('computeCanStartExecute requires validation, fresh version, EXECUTABLE, and open gate', () => {
    const openGate = { blocked: false, reasons: [] };
    expect(
      computeCanStartExecute({
        hasValidation: true,
        isStale: false,
        verdictStatus: 'EXECUTABLE',
        gateExecute: openGate,
      }),
    ).toBe(true);
    expect(
      computeCanStartExecute({
        hasValidation: false,
        isStale: false,
        verdictStatus: 'EXECUTABLE',
        gateExecute: openGate,
      }),
    ).toBe(false);
    expect(
      computeCanStartExecute({
        hasValidation: true,
        isStale: true,
        verdictStatus: 'EXECUTABLE',
        gateExecute: openGate,
      }),
    ).toBe(false);
    expect(
      computeCanStartExecute({
        hasValidation: true,
        isStale: false,
        verdictStatus: 'NOT_EXECUTABLE',
        gateExecute: openGate,
      }),
    ).toBe(false);
    expect(
      computeCanStartExecute({
        hasValidation: true,
        isStale: false,
        verdictStatus: 'EXECUTABLE',
        gateExecute: { blocked: true, reasons: [{ code: 'experience_regret_unconfirmed', message: 'x' }] },
      }),
    ).toBe(false);
  });
});
