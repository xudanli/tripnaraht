import {
  buildAddBufferRepairOption,
  shouldOfferAddBufferRepair,
} from './inter-day-buffer-repair.util';

describe('inter-day-buffer-repair.util', () => {
  describe('shouldOfferAddBufferRepair', () => {
    it('offers for inter_day_travel must / isStartTooEarly', () => {
      expect(
        shouldOfferAddBufferRepair({
          issueKind: 'inter_day_travel',
          isStartTooEarly: true,
        }),
      ).toBe(true);
      expect(
        shouldOfferAddBufferRepair({
          issueKind: 'inter_day_travel',
          priority: 'must_handle',
        }),
      ).toBe(true);
    });

    it('skips same_day_travel', () => {
      expect(
        shouldOfferAddBufferRepair({
          issueKind: 'same_day_travel',
          isStartTooEarly: true,
        }),
      ).toBe(false);
    });
  });

  describe('buildAddBufferRepairOption', () => {
    it('returns add_buffer action with day anchors', () => {
      const opt = buildAddBufferRepairOption({
        issueId: 'issue-x',
        fromDayNumber: 1,
        toDayNumber: 2,
        fromPlaceLabel: 'A',
        toPlaceLabel: 'B',
      });
      expect(opt.actionType).toBe('insert_rest_day');
      expect(opt.id).toBe('add_buffer');
      expect(opt.payload).toMatchObject({
        afterDayNumber: 1,
        beforeDayNumber: 2,
      });
    });
  });
});
