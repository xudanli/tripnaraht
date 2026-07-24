import {
  buildAddBufferMinutesRepairOption,
  buildFixedMinuteBufferRepairOption,
  buildMinuteBufferRepairOptions,
  buildShiftDepartureRepairOption,
  buildShiftEarlierRepairOption,
  computeShiftMinutes,
  findScheduleTimeOverlap,
  isPresetMinuteBufferViable,
  isShiftDepartureRepairViable,
  roundBufferMinutes,
  shouldOfferMinuteTimingRepairs,
} from './travel-timing-repair.util';

describe('travel-timing-repair.util', () => {
  it('computes shift minutes from shortfall + buffer', () => {
    expect(computeShiftMinutes(115, 5)).toBe(120);
  });

  it('rounds buffer minutes to 15m steps', () => {
    expect(roundBufferMinutes(22)).toBe(30);
  });

  it('builds shift_earlier with negative shiftMinutes in payload', () => {
    const opt = buildShiftEarlierRepairOption({
      issueId: 'issue-1',
      fromItemId: 'item-a',
      shortfallMinutes: 90,
      anchors: { travelMinutes: 200 },
    });
    expect(opt?.actionType).toBe('shift_earlier');
    expect(opt?.payload?.advanceMinutes).toBeGreaterThan(0);
    expect(opt?.payload?.shiftMinutes).toBeLessThan(0);
  });

  it('builds shift_departure payload with shiftMinutes', () => {
    const opt = buildShiftDepartureRepairOption({
      issueId: 'issue-1',
      toItemId: 'item-b',
      shortfallMinutes: 115,
      bufferMinutes: 5,
    });
    expect(opt.actionType).toBe('shift_departure');
    expect(opt.payload?.shiftMinutes).toBe(120);
  });

  it('builds fixed 30/60 add_buffer options', () => {
    const opts = buildMinuteBufferRepairOptions({
      issueId: 'issue-1',
      toItemId: 'item-b',
      shortfallMinutes: 16,
    });
    expect(opts.map((o) => o.payload?.bufferMinutes)).toEqual([30, 60]);
    expect(opts.every((o) => o.actionType === 'add_buffer')).toBe(true);
  });

  it('builds single fixed buffer option', () => {
    const opt = buildFixedMinuteBufferRepairOption({
      issueId: 'issue-1',
      toItemId: 'item-b',
      bufferMinutes: 30,
    });
    expect(opt.id).toBe('buffer-add-30');
    expect(opt.actionType).toBe('add_buffer');
  });

  it('builds add_buffer_minutes payload for non-preset shortfall', () => {
    const opt = buildAddBufferMinutesRepairOption({
      issueId: 'issue-1',
      toItemId: 'item-b',
      shortfallMinutes: 115,
    });
    expect(opt.actionType).toBe('add_buffer_minutes');
    expect(opt.payload?.bufferMinutes).toBe(120);
  });

  it('detects overlapping schedule intervals', () => {
    const start = new Date('2026-06-23T09:00:00Z');
    const end = new Date('2026-06-23T11:00:00Z');
    expect(
      findScheduleTimeOverlap({
        itemId: 'a',
        newStart: start,
        newEnd: end,
        siblings: [
          {
            id: 'b',
            startTime: new Date('2026-06-23T10:00:00Z'),
            endTime: new Date('2026-06-23T12:00:00Z'),
          },
        ],
      }),
    ).toBe('b');
  });

  describe('magnitude gates for minute-level repairs', () => {
    it('rejects preset buffers when shortfall exceeds 120 minutes', () => {
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 121, travelMinutes: 60 })).toBe(false);
      expect(
        buildMinuteBufferRepairOptions({
          issueId: 'issue-1',
          toItemId: 'item-b',
          shortfallMinutes: 597,
          anchors: { travelMinutes: 1920 },
        }),
      ).toEqual([]);
    });

    it('rejects preset buffers and shift when travel exceeds 8 hours', () => {
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 90, travelMinutes: 520 })).toBe(false);
      expect(isShiftDepartureRepairViable({ travelMinutes: 520 })).toBe(false);
      expect(
        shouldOfferMinuteTimingRepairs({
          toItemId: 'item-b',
          shortfallMinutes: 115,
          travelMinutes: 520,
          issueKind: 'inter_day_travel',
          priority: 'must_handle',
        }),
      ).toBe(false);
    });

    it('still allows small-gap minute buffers', () => {
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 45, travelMinutes: 90 })).toBe(true);
      expect(
        shouldOfferMinuteTimingRepairs({
          toItemId: 'item-b',
          shortfallMinutes: 45,
          travelMinutes: 90,
          issueKind: 'same_day_travel',
          priority: 'suggest_adjust',
        }),
      ).toBe(true);
    });

    it('allows shift but not preset buffers when shortfall is moderately large', () => {
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 150, travelMinutes: 200 })).toBe(false);
      expect(isShiftDepartureRepairViable({ travelMinutes: 200 })).toBe(true);
      expect(
        shouldOfferMinuteTimingRepairs({
          toItemId: 'item-b',
          shortfallMinutes: 150,
          travelMinutes: 200,
          isStartTooEarly: true,
        }),
      ).toBe(true);
      expect(
        buildMinuteBufferRepairOptions({
          issueId: 'issue-1',
          toItemId: 'item-b',
          shortfallMinutes: 150,
          anchors: { travelMinutes: 200 },
        }),
      ).toEqual([]);
    });
  });
});
