import {
  buildAddBufferMinutesRepairOption,
  buildFixedMinuteBufferRepairOption,
  buildMinuteBufferRepairOptions,
  buildShiftDepartureRepairOption,
  computeShiftMinutes,
  findScheduleTimeOverlap,
  roundBufferMinutes,
} from './travel-timing-repair.util';

describe('travel-timing-repair.util', () => {
  it('computes shift minutes from shortfall + buffer', () => {
    expect(computeShiftMinutes(115, 5)).toBe(120);
  });

  it('rounds buffer minutes to 15m steps', () => {
    expect(roundBufferMinutes(22)).toBe(30);
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
});
