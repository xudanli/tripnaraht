import {
  buildFixedMinuteBufferRepairOption,
  buildShiftDepartureRepairOption,
} from '../../trip-constraint-solver/utils/travel-timing-repair.util';
import { buildAddBufferRepairOption } from '../../trip-constraint-solver/utils/inter-day-buffer-repair.util';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import {
  extractTradeoffsFromRepairPayload,
  normalizeRepairOptionTradeoffs,
} from './tradeoff.normalizer';

function issue(partial: Partial<FeasibilityIssueDto> & Pick<FeasibilityIssueDto, 'id' | 'message'>): FeasibilityIssueDto {
  return {
    priority: 'must_handle',
    category: 'transport',
    title: partial.message.slice(0, 40),
    affectedDays: [2],
    severity: 'high',
    ...partial,
    message: partial.message,
    id: partial.id,
  };
}

function repairOptionFromFeasibility(
  dto: ReturnType<typeof buildFixedMinuteBufferRepairOption>,
): Parameters<typeof normalizeRepairOptionTradeoffs>[0] {
  return {
    id: dto.id,
    title: dto.label,
    description: dto.description,
    impact: 'medium',
    actionType: dto.actionType,
    payload: dto.payload,
  };
}

describe('tradeoff.normalizer payload deltas (batch 1)', () => {
  const timingIssue = issue({
    id: 'issue-timing',
    message: '交通衔接不足',
    anchors: { shortfallMinutes: 597, travelMinutes: 200 },
  });

  it('maps +30 vs +60 buffer options to distinct minute values', () => {
    const opt30 = repairOptionFromFeasibility(
      buildFixedMinuteBufferRepairOption({
        issueId: 'issue-timing',
        toItemId: 'item-b',
        bufferMinutes: 30,
      }),
    );
    const opt60 = repairOptionFromFeasibility(
      buildFixedMinuteBufferRepairOption({
        issueId: 'issue-timing',
        toItemId: 'item-b',
        bufferMinutes: 60,
      }),
    );

    const t30 = normalizeRepairOptionTradeoffs(opt30, timingIssue);
    const t60 = normalizeRepairOptionTradeoffs(opt60, timingIssue);

    expect(t30.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(30);
    expect(t60.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(60);
    expect(t30.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(30);
    expect(t60.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(60);
    expect(t30.some((t) => t.value === 597)).toBe(false);
  });

  it('maps shift_departure to delay cost and payload shortfall benefit', () => {
    const dto = buildShiftDepartureRepairOption({
      issueId: 'issue-timing',
      toItemId: 'item-b',
      shortfallMinutes: 90,
      bufferMinutes: 15,
    });
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: dto.id,
        title: dto.label,
        description: dto.description,
        impact: 'medium',
        actionType: dto.actionType,
        payload: dto.payload,
      },
      issue({ id: 'i', message: 'm', anchors: { shortfallMinutes: 597 } }),
    );

    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(105);
    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'IMPROVE')?.value).toBe(90);
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });

  it('maps insert_rest_day to +1 DAY without problem shortfall as value', () => {
    const dto = buildAddBufferRepairOption({
      issueId: 'issue-inter-day',
      fromDayNumber: 3,
      toDayNumber: 4,
    });
    const tradeoffs = extractTradeoffsFromRepairPayload(
      {
        id: dto.id,
        title: dto.label,
        description: dto.description,
        impact: 'high',
        actionType: dto.actionType,
        payload: dto.payload,
      },
      issue({ id: 'i', message: '跨日', anchors: { shortfallMinutes: 597 } }),
    );

    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')).toMatchObject({
      value: 1,
      unit: 'DAY',
    });
    expect(tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBeUndefined();
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });

  it('maps relocate_lodging expectedDriveReductionMinutes to FATIGUE IMPROVE', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'change_day2_lodging',
        title: '更换 Day 2 住宿',
        description: '将 Day 2 住宿替换为更靠近下一活动的地点，预计可缩短约 1 小时 20 分钟 驾驶。',
        impact: 'high',
        cost: 420,
        actionType: 'relocate_lodging',
        payload: { dayNumber: 2, issueId: 'i', expectedDriveReductionMinutes: 80 },
      },
      issue({ id: 'i', message: '驾驶', issueKind: 'daily_drive', anchors: { shortfallMinutes: 90 } }),
    );
    expect(tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(80);
    expect(tradeoffs.find((t) => t.dimension === 'COST' && t.direction === 'WORSEN')?.value).toBe(420);
    expect(tradeoffs.some((t) => t.value === 90)).toBe(false);
  });

  it('maps split_day payload to drive reduction without problem shortfall', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'split_drive_day2',
        title: '拆分 Day 2 行程',
        description: '将部分 POI 移至相邻日期，使驾驶降至 4 小时以内。',
        impact: 'medium',
        actionType: 'split_day',
        payload: {
          dayNumber: 2,
          issueId: 'i',
          expectedDriveReductionMinutes: 80,
          targetTravelMinutes: 240,
        },
      },
      issue({ id: 'i', message: '驾驶', issueKind: 'daily_drive', anchors: { shortfallMinutes: 90 } }),
    );
    expect(tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(80);
    expect(tradeoffs.some((t) => t.value === 90)).toBe(false);
  });

  it('maps shift_earlier advanceMinutes to TIME IMPROVE', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'shift_earlier',
        title: '提前 45 分钟出发',
        description: '前移出发时间',
        impact: 'high',
        actionType: 'shift_earlier',
        payload: { advanceMinutes: 45, shiftMinutes: -45, shortfallMinutes: 90 },
      },
      issue({ id: 'i', message: '衔接', anchors: { shortfallMinutes: 597 } }),
    );
    expect(tradeoffs.find((t) => t.dimension === 'TIME' && t.direction === 'IMPROVE' && t.value === 45)).toBeTruthy();
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });

  it('maps remove_poi payload savedMinutes to FATIGUE IMPROVE without problem shortfall', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'drop_poi',
        title: '移除远端 POI',
        description: '从 Day 3 移除较远景点，预计可缩短约 95 分钟驾驶。',
        impact: 'medium',
        actionType: 'remove_poi',
        payload: {
          itemId: 'item-far-poi',
          itemLabel: '远端 POI',
          dayNumber: 3,
          savedMinutes: 95,
        },
      },
      issue({ id: 'i', message: '驾驶', issueKind: 'daily_drive', anchors: { shortfallMinutes: 90 } }),
    );

    expect(tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(95);
    expect(tradeoffs.find((t) => t.dimension === 'POI_COVERAGE' && t.direction === 'WORSEN')).toBeTruthy();
    expect(tradeoffs.some((t) => t.value === 90)).toBe(false);
  });

  it('without payload still omits problem shortfall numeric fallback', () => {
    const tradeoffs = normalizeRepairOptionTradeoffs(
      {
        id: 'buffer-add-30',
        title: '加 30 分钟缓冲',
        description: '缓解衔接',
        impact: 'medium',
      },
      timingIssue,
    );
    const fatigue = tradeoffs.find((t) => t.dimension === 'FATIGUE');
    expect(fatigue?.direction).toBe('IMPROVE');
    expect(fatigue?.value).toBeUndefined();
    expect(tradeoffs.some((t) => t.value === 597)).toBe(false);
  });
});
