import { createResourceLockSideEffect } from './resource-lock.side-effect';

describe('ResourceLockSideEffect', () => {
  it('applies lock and rollback releases it via prisma', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      physicalDomainInventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv-1',
          availability: 'AVAILABLE',
          lockable: true,
        }),
        update,
      },
    };
    const effect = createResourceLockSideEffect(prisma);
    const ctx: any = {
      action_id: 'a1',
      action_name: 'trip.apply_user_edit',
      target_ref: 'inv-1',
      action_input: {},
    };

    const applied = await effect.apply(ctx, { ttl_seconds: 120 });
    expect(applied?.kind).toBe('RESOURCE_LOCK');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ holdExpiresAt: expect.any(Date) }),
      }),
    );

    const rolled = await effect.rollback?.(ctx, {});
    expect(rolled?.kind).toBe('RESOURCE_LOCK');
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'inv-1' },
      data: { holdExpiresAt: null },
    });
  });
});

