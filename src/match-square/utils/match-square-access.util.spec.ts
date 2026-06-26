import { resolveMatchSquareAccess } from './match-square-access.util';

describe('match-square-access.util', () => {
  it('always marks match square as frozen regardless of publishing permission', async () => {
    const publishingPermission = {
      canPublicRecruit: jest.fn().mockResolvedValue({
        allowed: true,
      }),
    } as never;

    const access = await resolveMatchSquareAccess(publishingPermission, 'user-1', true);
    expect(access.frozen).toBe(true);
    expect(access.canPost).toBe(false);
    expect(access.canApply).toBe(false);
    expect(access.canBrowse).toBe(true);
    expect(access.frozenReason).toContain('搭子广场公开招募已暂停');
    expect(publishingPermission.canPublicRecruit).not.toHaveBeenCalled();
  });
});
