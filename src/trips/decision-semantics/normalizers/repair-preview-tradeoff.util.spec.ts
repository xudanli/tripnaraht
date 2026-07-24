import type { PreviewRepairResponse } from '../../readiness/types/coverage-map.types';
import { extractTradeoffsFromRepairPreview } from './repair-preview-tradeoff.util';
import { normalizeRepairOptionTradeoffs } from './tradeoff.normalizer';

describe('repair-preview-tradeoff.util', () => {
  it('extracts minute delay from itineraryDiff time_changed', () => {
    const preview: PreviewRepairResponse = {
      tripId: 't1',
      blockerId: 'b1',
      optionId: 'shift_departure',
      actionType: 'shift_departure',
      previewMode: 'decision_engine_dry_run',
      status: 'preview',
      message: 'preview',
      before: { dayNumber: 2, itemCount: 3, totalItemCount: 8, highlights: [] },
      after: { dayNumber: 2, itemCount: 3, totalItemCount: 8, highlights: [] },
      itineraryDiff: [
        {
          slotId: 'item-b',
          changeType: 'time_changed',
          dayNumber: 2,
          before: { time: '09:00', title: '米湖' },
          after: { time: '09:45', title: '米湖' },
        },
      ],
      impact: { feasibilityScoreBefore: 40, estimated: true },
      option: {
        id: 'shift_departure',
        title: '顺延',
        description: 'd',
        impact: 'medium',
        actionType: 'shift_departure',
      },
    };

    const tradeoffs = extractTradeoffsFromRepairPreview(
      preview,
      preview.option,
      {
        id: 'i1',
        priority: 'must_handle',
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [2],
        severity: 'high',
        anchors: { shortfallMinutes: 597 },
      },
    );

    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(45);
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });

  it('extracts remove_poi saved minutes from preview removed diff + payload', () => {
    const preview: PreviewRepairResponse = {
      tripId: 't1',
      blockerId: 'b1',
      optionId: 'drop_poi',
      actionType: 'remove_poi',
      previewMode: 'decision_engine_dry_run',
      status: 'preview',
      message: 'preview',
      before: { dayNumber: 3, itemCount: 4, totalItemCount: 10, highlights: [] },
      after: { dayNumber: 3, itemCount: 3, totalItemCount: 9, highlights: [] },
      itineraryDiff: [
        {
          slotId: 'item-far-poi',
          changeType: 'removed',
          dayNumber: 3,
          before: { time: '14:00', endTime: '15:30', title: '远端 POI' },
        },
      ],
      impact: { feasibilityScoreBefore: 40, estimated: true },
      option: {
        id: 'drop_poi',
        title: '移除远端 POI',
        description: '减少当日驾驶',
        impact: 'medium',
        actionType: 'remove_poi',
        payload: { itemId: 'item-far-poi', savedMinutes: 95 },
      },
    };

    const tradeoffs = normalizeRepairOptionTradeoffs(preview.option, {
      id: 'issue-daily-drive-d3',
      priority: 'must_handle',
      category: 'transport',
      title: '驾驶过长',
      message: 'm',
      affectedDays: [3],
      severity: 'high',
      issueKind: 'daily_drive',
      anchors: { shortfallMinutes: 90 },
    });

    expect(tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(95);
    expect(tradeoffs.find((t) => t.dimension === 'POI_COVERAGE' && t.direction === 'WORSEN')).toBeTruthy();
  });

  it('falls back to preview when option has no payload delta', () => {
    const preview: PreviewRepairResponse = {
      tripId: 't1',
      blockerId: 'b1',
      optionId: 'opt-1',
      actionType: 'shift_departure',
      previewMode: 'heuristic',
      status: 'preview',
      message: 'preview',
      before: { dayNumber: 2, itemCount: 0, totalItemCount: 0, highlights: [] },
      after: { dayNumber: 2, itemCount: 0, totalItemCount: 0, highlights: ['+120 分钟'] },
      itineraryDiff: [],
      impact: { feasibilityScoreBefore: 0, feasibilityScoreAfter: 10, estimated: true },
      option: {
        id: 'opt-1',
        title: '顺延',
        description: 'd',
        impact: 'medium',
        actionType: 'shift_departure',
      },
    };

    const tradeoffs = normalizeRepairOptionTradeoffs(
      { id: 'opt-1', title: '顺延', description: 'd', impact: 'medium', actionType: 'shift_departure' },
      {
        id: 'i1',
        priority: 'must_handle',
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [2],
        severity: 'high',
        anchors: { shortfallMinutes: 597 },
      },
      preview,
    );

    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(120);
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });
});
