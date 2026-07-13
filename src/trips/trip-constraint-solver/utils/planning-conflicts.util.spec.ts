import {
  ConflictDto,
  ConflictSeverity,
  ConflictType,
} from '../../dto/trip-conflicts.dto';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  assemblePlanningConflicts,
  buildPlanningConflictsSummary,
  feasibilityIssueToPlanningItem,
  isLunchValidationNoise,
  isScheduleConflictCoveredByFeasibilityIssue,
  mapScheduleConflictCategory,
  mapScheduleSeverityToPriority,
  parseScheduleAffectedDayNumbers,
  scheduleConflictToPlanningItem,
} from './planning-conflicts.util';

function makeIssue(overrides: Partial<FeasibilityIssueDto> = {}): FeasibilityIssueDto {
  return {
    id: 'poi-access:item-1:poi_access_reservation_required',
    priority: 'must_handle',
    category: 'access_capacity',
    title: '需预约',
    message: 'Landmannalaugar 需停车预约',
    affectedDays: [3],
    severity: 'high',
    issueKind: 'poi_access_reservation_required',
    proofs: [{ itemId: 'item-1', kind: 'trip_item' }],
    ...overrides,
  };
}

function makeConflict(overrides: Partial<ConflictDto> = {}): ConflictDto {
  return {
    id: 'c1',
    type: ConflictType.BUFFER_INSUFFICIENT,
    severity: ConflictSeverity.MEDIUM,
    title: '缓冲不足',
    description: 'Day 3 缓冲不足',
    affectedDays: ['Day 3'],
    affectedItemIds: ['item-1'],
    suggestions: [],
    ...overrides,
  };
}

describe('planning-conflicts.util', () => {
  describe('mapScheduleConflictCategory', () => {
    it('maps transport and team_fit per handoff §3.1', () => {
      expect(mapScheduleConflictCategory(ConflictType.TRANSPORT_TOO_LONG)).toBe('transport');
      expect(mapScheduleConflictCategory(ConflictType.FATIGUE_EXCEEDED)).toBe('team_fit');
      expect(mapScheduleConflictCategory(ConflictType.DUPLICATE_ITEM)).toBe('structure');
    });
  });

  describe('mapScheduleSeverityToPriority', () => {
    it('maps severity per handoff §3.2', () => {
      expect(mapScheduleSeverityToPriority(ConflictSeverity.HIGH)).toBe('must_handle');
      expect(mapScheduleSeverityToPriority(ConflictSeverity.MEDIUM)).toBe('suggest_adjust');
      expect(mapScheduleSeverityToPriority(ConflictSeverity.LOW)).toBe('pending_confirm');
    });
  });

  describe('isLunchValidationNoise', () => {
    it('filters low-severity lunch window conflicts', () => {
      expect(
        isLunchValidationNoise(
          makeConflict({ type: ConflictType.LUNCH_WINDOW, severity: ConflictSeverity.LOW }),
        ),
      ).toBe(true);
      expect(
        isLunchValidationNoise(
          makeConflict({ type: ConflictType.LUNCH_WINDOW, severity: ConflictSeverity.MEDIUM }),
        ),
      ).toBe(false);
    });
  });

  describe('coverage dedupe', () => {
    it('drops schedule conflict when affectedItemIds overlap issue proofs', () => {
      const issue = makeIssue();
      const conflict = makeConflict({ affectedItemIds: ['item-1'] });
      expect(isScheduleConflictCoveredByFeasibilityIssue(conflict, issue)).toBe(true);
    });

    it('drops schedule conflict when affectedDays overlap', () => {
      const issue = makeIssue({ proofs: [], affectedDays: [3] });
      const conflict = makeConflict({
        affectedItemIds: [],
        affectedDays: ['Day 3'],
      });
      expect(isScheduleConflictCoveredByFeasibilityIssue(conflict, issue)).toBe(true);
    });

    it('keeps schedule-only conflict when not covered', () => {
      const issue = makeIssue({ affectedDays: [1], proofs: [{ itemId: 'other' }] });
      const conflict = makeConflict({
        affectedItemIds: ['item-99'],
        affectedDays: ['Day 5'],
      });
      expect(isScheduleConflictCoveredByFeasibilityIssue(conflict, issue)).toBe(false);
    });
  });

  describe('travel scope BFF fields', () => {
    it('parseScheduleAffectedDayNumbers ignores ISO calendar dates', () => {
      expect(parseScheduleAffectedDayNumbers(['2026-07-19', '4'])).toEqual([4]);
    });

    it('projects affectedDayNumbers and affectedScopeSummary for same_day_travel', () => {
      const item = feasibilityIssueToPlanningItem(
        makeIssue({
          issueKind: 'same_day_travel',
          affectedDays: [4],
          anchors: {
            fromDayNumber: 4,
            toDayNumber: 4,
            fromPlaceLabel: '瓦特纳冰川',
            toPlaceLabel: '冰河湖',
          },
        }),
      );

      expect(item.affectedDayNumbers).toEqual([4]);
      expect(item.affectedScopeSummary).toBe('瓦特纳冰川 → 冰河湖');
      expect(item.issue?.affectedDayNumbers).toEqual([4]);
    });

    it('projects transfer_buffer scope fields from BUFFER_INSUFFICIENT schedule conflict', () => {
      const item = scheduleConflictToPlanningItem(
        makeConflict({
          fromPlaceLabel: '瓦特纳冰川',
          toPlaceLabel: '冰河湖',
          fromDayNumber: 4,
          toDayNumber: 4,
          affectedDays: ['4'],
          issueKind: 'buffer_insufficient',
        }),
      );

      expect(item.affectedDayNumbers).toEqual([4]);
      expect(item.affectedScopeSummary).toBe('瓦特纳冰川 → 冰河湖');
    });
  });

  describe('assemblePlanningConflicts', () => {
    it('merges feasibility issues with uncovered schedule conflicts', () => {
      const items = assemblePlanningConflicts({
        tripId: 'trip-1',
        issues: [makeIssue()],
        scheduleConflicts: [
          makeConflict(),
          makeConflict({
            id: 'c2',
            type: ConflictType.LUNCH_WINDOW,
            severity: ConflictSeverity.LOW,
          }),
          makeConflict({
            id: 'c3',
            affectedItemIds: ['item-99'],
            affectedDays: ['Day 5'],
          }),
        ],
      });

      expect(items).toHaveLength(2);
      expect(items[0].source).toBe('feasibility');
      expect(items[0].semanticKey).toBeDefined();
      expect(items[1].source).toBe('schedule');
      expect(items[1].id).toBe('schedule:c3');
    });

    it('builds summary counts', () => {
      const items = [
        scheduleConflictToPlanningItem(
          makeConflict({ severity: ConflictSeverity.HIGH }),
        ),
        scheduleConflictToPlanningItem(
          makeConflict({ id: 'c2', severity: ConflictSeverity.LOW }),
        ),
      ];
      const summary = buildPlanningConflictsSummary(items);
      expect(summary.total).toBe(2);
      expect(summary.mustHandle).toBe(1);
      expect(summary.pendingConfirm).toBe(1);
    });
  });
});
