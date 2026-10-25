import { normalizeIdentityPatch } from '../dto/mobile-identity.dto';
import { MobileIdentityService } from './mobile-identity.service';

describe('normalizeIdentityPatch', () => {
  it('extracts nationality from picker object and aliases', () => {
    expect(normalizeIdentityPatch({ nationality: { code: 'cn' } }).nationality).toBe(
      'CN',
    );
    expect(normalizeIdentityPatch({ nationalityCode: 'jp' }).nationality).toBe('JP');
    expect(normalizeIdentityPatch({ countryCode: 'is' }).nationality).toBe('IS');
  });

  it('extracts residencyRegion from object or alias', () => {
    expect(
      normalizeIdentityPatch({ residencyRegion: { code: 'cn-sh' } }).residencyRegion,
    ).toBe('CN-SH');
    expect(
      normalizeIdentityPatch({ residencyRegionCode: 'CN-BJ' }).residencyRegion,
    ).toBe('CN-BJ');
  });
});

describe('MobileIdentityService', () => {
  function makeService(opts?: {
    user?: Record<string, unknown> | null;
    preferences?: Record<string, unknown>;
  }) {
    const preferences = opts?.preferences ?? {};
    const other = (preferences.other as Record<string, unknown> | undefined) ?? {};
    const store = {
      readKey: jest.fn().mockResolvedValue({
        value: other.identity,
        preferences,
        other,
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      readOther: jest.fn().mockResolvedValue({
        preferences,
        other,
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          opts?.user === undefined
            ? {
                id: '550e8400-e29b-41d4-a716-446655440000',
                displayName: '旧昵称',
                avatarUrl: null,
                email: 'a@b.com',
                updatedAt: new Date('2026-08-01T00:00:00.000Z'),
              }
            : opts.user,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue({
          updatedAt: new Date('2026-08-13T00:00:00.000Z'),
        }),
      },
      countryProfile: {
        findUnique: jest.fn().mockResolvedValue({
          nameCN: '中国',
          nameEN: 'China',
        }),
      },
    };
    const svc = new MobileIdentityService(store as never, prisma as never);
    return { svc, store, prisma };
  }

  it('GET falls back to legacy preferences.nationality', async () => {
    const { svc } = makeService({
      preferences: { nationality: 'CN', residencyCountry: 'CN' },
    });
    const id = await svc.getIdentity('550e8400-e29b-41d4-a716-446655440000');
    expect(id.nationality).toBe('CN');
    expect(id.residencyRegion).toBe('CN');
    expect(id.nationalityLabelZh).toBe('中国');
  });

  it('PATCH dual-writes identity + legacy nationality/residencyCountry', async () => {
    const { svc, prisma } = makeService({ preferences: { other: {} } });
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    // after upsert, subsequent getIdentity should see merged store — re-stub readKey
    const store = (svc as unknown as { store: { readKey: jest.Mock; readOther: jest.Mock } })
      .store;
    store.readOther.mockResolvedValue({ preferences: {}, other: {}, updatedAt: null });
    store.readKey.mockResolvedValue({
      value: {
        nationality: 'CN',
        residencyRegion: 'CN-SH',
        phone: '+8613800138000',
      },
      preferences: { nationality: 'CN', residencyCountry: 'CN' },
      other: {},
      updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    });

    await svc.patchIdentity(userId, {
      nationality: 'CN',
      residencyRegion: 'CN-SH',
      phone: '+8613800138000',
      displayName: '新昵称',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { displayName: '新昵称' },
    });
    expect(prisma.userProfile.upsert).toHaveBeenCalled();
    const upsertArg = prisma.userProfile.upsert.mock.calls[0][0];
    const prefs = upsertArg.update.preferences;
    // Prisma Json input may be plain object via toInputJsonValue
    const plain = typeof prefs === 'object' ? prefs : JSON.parse(String(prefs));
    expect(plain.nationality).toBe('CN');
    expect(plain.residencyCountry).toBe('CN');
    expect(plain.other.identity.nationality).toBe('CN');
    expect(plain.other.identity.residencyRegion).toBe('CN-SH');
    expect(plain.other.identity.phone).toBe('+8613800138000');
  });

  it('rejects invalid nationality code', async () => {
    const { svc } = makeService();
    await expect(
      svc.patchIdentity('550e8400-e29b-41d4-a716-446655440000', {
        nationality: 'CHINA',
      }),
    ).rejects.toThrow(/nationality/);
  });
});
