import { applyTripUserEdits } from './trip-user-edit.util';

describe('trip-user-edit.util', () => {
  it('applies delete edit', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const svc = { remove, update: jest.fn() } as any;
    const out = await applyTripUserEdits(svc, [{ type: 'delete', itemId: 'item-1' }]);
    expect(out.success).toBe(true);
    expect(remove).toHaveBeenCalledWith('item-1');
  });

  it('applies add edit', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'new-item' });
    const svc = { remove: jest.fn(), update: jest.fn(), create } as any;
    const out = await applyTripUserEdits(svc, [
      {
        type: 'add',
        tripDayId: 'day-1',
        placeId: 501,
        startTime: '2026-06-03T10:00:00.000Z',
        endTime: '2026-06-03T12:00:00.000Z',
      },
    ]);
    expect(out.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tripDayId: 'day-1',
        placeId: 501,
        type: 'ACTIVITY',
      }),
    );
  });
});
