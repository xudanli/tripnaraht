import { ConflictType } from '../../dto/trip-conflicts.dto';
import {
  buildAffectedScopeSummary,
  buildTravelScopeBffFields,
  buildTravelScopeBffFieldsFromConflict,
  enrichTravelScopeBffFields,
  normalizeAffectedDayNumbers,
} from './travel-scope-bff.util';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

describe('travel-scope-bff.util', () => {
  describe('buildAffectedScopeSummary', () => {
    it('formats from → to labels', () => {
      expect(buildAffectedScopeSummary('瓦特纳冰川', '冰河湖')).toBe('瓦特纳冰川 → 冰河湖');
    });
  });

  describe('normalizeAffectedDayNumbers', () => {
    it('merges affectedDays and anchor day numbers', () => {
      expect(
        normalizeAffectedDayNumbers({
          affectedDays: [4],
          fromDayNumber: 4,
          toDayNumber: 4,
        }),
      ).toEqual([4]);
    });
  });

  describe('buildTravelScopeBffFields', () => {
    it('returns stable fields for same_day_travel', () => {
      expect(
        buildTravelScopeBffFields({
          issueKind: 'same_day_travel',
          affectedDays: [4],
          anchors: {
            fromDayNumber: 4,
            toDayNumber: 4,
            fromPlaceLabel: '瓦特纳冰川',
            toPlaceLabel: '冰河湖',
          },
        }),
      ).toEqual({
        affectedDayNumbers: [4],
        affectedScopeSummary: '瓦特纳冰川 → 冰河湖',
      });
    });

    it('maps transfer_buffer to buffer_insufficient scope fields', () => {
      expect(
        buildTravelScopeBffFields({
          issueKind: 'transfer_buffer',
          affectedDays: [4],
          fromPlaceLabel: '瓦特纳冰川',
          toPlaceLabel: '冰河湖',
        }),
      ).toEqual({
        affectedDayNumbers: [4],
        affectedScopeSummary: '瓦特纳冰川 → 冰河湖',
      });
    });

    it('parses scope summary from message when labels missing', () => {
      expect(
        buildTravelScopeBffFields({
          issueKind: 'same_day_travel',
          affectedDays: [4],
          message: '第4天 · 瓦特纳冰川 → 冰河湖（缓冲偏紧）',
        }),
      ).toEqual({
        affectedDayNumbers: [4],
        affectedScopeSummary: '瓦特纳冰川 → 冰河湖',
      });
    });
  });

  describe('enrichTravelScopeBffFields', () => {
    it('leaves unrelated issues unchanged', () => {
      const issue: FeasibilityIssueDto = {
        id: 'x',
        priority: 'must_handle',
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [1],
        severity: 'high',
        issueKind: 'daily_drive',
      };
      expect(enrichTravelScopeBffFields(issue)).toEqual(issue);
    });
  });

  describe('buildTravelScopeBffFieldsFromConflict', () => {
    it('derives fields from BUFFER_INSUFFICIENT conflict', () => {
      expect(
        buildTravelScopeBffFieldsFromConflict(
          {
            id: 'buffer-insufficient-a-b',
            type: ConflictType.BUFFER_INSUFFICIENT,
            severity: 'MEDIUM' as never,
            title: '缓冲不足',
            description: '活动间隔偏紧',
            affectedDays: ['4'],
            affectedItemIds: ['a', 'b'],
            suggestions: [],
            fromPlaceLabel: '瓦特纳冰川',
            toPlaceLabel: '冰河湖',
            fromDayNumber: 4,
            toDayNumber: 4,
            issueKind: 'buffer_insufficient',
          },
          [4],
        ),
      ).toEqual({
        affectedDayNumbers: [4],
        affectedScopeSummary: '瓦特纳冰川 → 冰河湖',
      });
    });
  });
});
