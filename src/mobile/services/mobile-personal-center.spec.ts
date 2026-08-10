import { BadRequestException } from '@nestjs/common';
import { deepMerge } from './user-preferences-other.store';
import { MobileIdentityService } from './mobile-identity.service';
import { normalizeIdentityPatch } from '../dto/mobile-identity.dto';
import { MobileTravelPortraitService } from './mobile-travel-portrait.service';
import {
  MobileDriverProfileService,
  buildSummary,
  deriveQualificationStatus,
} from './mobile-driver-profile.service';
import { DEFAULT_DRIVER_PROFILE } from '../dto/mobile-driver-profile.dto';

describe('deepMerge', () => {
  it('merges nested objects without dropping siblings', () => {
    const out = deepMerge(
      { a: 1, nested: { x: 1, y: 2 } },
      { nested: { y: 9, z: 3 }, b: 2 },
    );
    expect(out).toEqual({ a: 1, b: 2, nested: { x: 1, y: 9, z: 3 } });
  });
});

describe('normalizeIdentityPatch', () => {
  it('extracts code from picker objects and aliases', () => {
    expect(
      normalizeIdentityPatch({
        nationality: { code: 'cn', nameZh: '中国' },
        residencyRegion: { code: 'cn-sh' },
      }),
    ).toEqual({
      nationality: 'CN',
      residencyRegion: 'CN-SH',
    });
    expect(normalizeIdentityPatch({ nationalityCode: 'jp' }).nationality).toBe('JP');
    expect(normalizeIdentityPatch({ countryCode: 'is' }).nationality).toBe('IS');
  });
});

describe('MobileIdentityService', () => {
  function build(opts?: {
    user?: Record<string, unknown> | null;
    other?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
  }) {
    const store = {
      readKey: jest.fn().mockResolvedValue({
        value: opts?.other?.identity,
        preferences: {
          nationality: 'JP',
          residencyCountry: 'JP',
          ...(opts?.preferences ?? {}),
          other: opts?.other ?? {},
        },
        other: opts?.other ?? {},
        updatedAt: new Date('2026-07-21T00:00:00Z'),
      }),
      readOther: jest.fn().mockResolvedValue({
        preferences: {
          nationality: 'JP',
          residencyCountry: 'JP',
          ...(opts?.preferences ?? {}),
          other: opts?.other ?? {},
        },
        other: opts?.other ?? {},
        updatedAt: new Date('2026-07-21T00:00:00Z'),
      }),
      mergeKey: jest.fn(),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          opts?.user === null
            ? null
            : {
                displayName: 'Danny',
                avatarUrl: 'https://x/a.png',
                email: 'danny@example.com',
                updatedAt: new Date('2026-07-20T00:00:00Z'),
                ...(opts?.user ?? {}),
              },
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue({ updatedAt: new Date() }),
      },
      countryProfile: {
        findUnique: jest.fn().mockResolvedValue({ nameCN: '日本', nameEN: 'Japan' }),
      },
    };
    const svc = new MobileIdentityService(store as never, prisma as never);
    return { svc, store, prisma };
  }

  it('GET merges User fields and falls back nationality from preferences', async () => {
    const { svc } = build({ other: {} });
    const res = await svc.getIdentity('u1');
    expect(res.displayName).toBe('Danny');
    expect(res.email).toBe('danny@example.com');
    expect(res.nationality).toBe('JP');
    expect(res.nationalityLabelZh).toBe('日本');
    expect(res.visibility.legalFullName).toBe('self_only');
  });

  it('PATCH rejects bad dateOfBirth', async () => {
    const { svc } = build();
    await expect(
      svc.patchIdentity('u1', { dateOfBirth: '21-07-2026' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PATCH accepts picker object nationality and dual-writes legacy prefs', async () => {
    const { svc, store, prisma } = build();
    store.readOther.mockResolvedValue({
      preferences: { other: {} },
      other: {},
      updatedAt: new Date(),
    });
    store.readKey.mockResolvedValue({
      value: { nationality: 'CN', residencyRegion: 'CN-SH' },
      preferences: { nationality: 'CN', residencyCountry: 'CN', other: {} },
      other: {},
      updatedAt: new Date(),
    });
    prisma.countryProfile.findUnique.mockResolvedValue({
      nameCN: '中国',
      nameEN: 'China',
    });

    await svc.patchIdentity('u1', {
      nationality: { code: 'CN', nameZh: '中国' },
      residencyRegion: { code: 'CN-SH' },
    });

    expect(prisma.userProfile.upsert).toHaveBeenCalled();
    const prefs = prisma.userProfile.upsert.mock.calls[0][0].update
      .preferences as Record<string, unknown>;
    expect(prefs.nationality).toBe('CN');
    expect(prefs.residencyCountry).toBe('CN');
    expect(
      (prefs.other as { identity: { nationality: string } }).identity.nationality,
    ).toBe('CN');
  });

  it('PATCH updates User displayName and stores sensitive fields', async () => {
    const { svc, store, prisma } = build();
    store.readOther.mockResolvedValue({
      preferences: { other: {} },
      other: {},
      updatedAt: new Date(),
    });
    store.readKey.mockResolvedValue({
      value: { phone: '+8610' },
      preferences: { other: {} },
      other: {},
      updatedAt: new Date(),
    });
    await svc.patchIdentity('u1', { displayName: 'Dan', phone: '+8610' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: 'Dan' }),
      }),
    );
    expect(prisma.userProfile.upsert).toHaveBeenCalled();
  });
});

describe('MobileTravelPortraitService', () => {
  it('rejects illegal travelPace', async () => {
    const store = {
      readKey: jest.fn(),
      mergeKey: jest.fn(),
    };
    const prisma = {
      user_fitness_profile_snapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new MobileTravelPortraitService(store as never, prisma as never);
    await expect(
      svc.patchPortrait('u1', { pace: { travelPace: 'turbo' as never } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GET returns defaults and fitness ref', async () => {
    const store = {
      readKey: jest.fn().mockResolvedValue({
        value: undefined,
        preferences: {},
        other: {},
        updatedAt: new Date('2026-07-21T00:00:00Z'),
      }),
      mergeKey: jest.fn(),
    };
    const prisma = {
      user_fitness_profile_snapshot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'f1' }),
      },
    };
    const svc = new MobileTravelPortraitService(store as never, prisma as never);
    const res = await svc.getPortrait('u1');
    expect(res.pace.travelPace).toBe('balanced');
    expect(res.fitnessProfileRef).toEqual({
      hasProfile: true,
      source: '/api/v1/fitness/profile',
    });
  });
});

describe('MobileDriverProfileService summary', () => {
  it('normalizeDriverProfilePatch lifts flat fields and maps night aliases', () => {
    const { normalizeDriverProfilePatch } = require('../dto/mobile-driver-profile.dto');
    expect(
      normalizeDriverProfilePatch({
        snow: 'average',
        nightAcceptance: 'accept',
        hasValidLicense: true,
        expiresOn: '2028-01-01',
      }),
    ).toEqual({
      qualification: {
        hasValidLicense: true,
        expiresOn: '2028-01-01',
      },
      experience: { snow: 'average' },
      longTermPrefs: { nightDrivingAcceptance: 'ok' },
    });
  });

  it('deriveQualificationStatus covers incomplete/valid/expired', () => {
    expect(
      deriveQualificationStatus({
        ...DEFAULT_DRIVER_PROFILE.qualification,
        hasValidLicense: false,
      }),
    ).toBe('incomplete');
    expect(
      deriveQualificationStatus({
        ...DEFAULT_DRIVER_PROFILE.qualification,
        hasValidLicense: true,
        expiresOn: '2099-01-01',
        verificationStatus: 'verified',
      }),
    ).toBe('valid');
    expect(
      deriveQualificationStatus({
        ...DEFAULT_DRIVER_PROFILE.qualification,
        hasValidLicense: true,
        expiresOn: '2020-01-01',
      }),
    ).toBe('expired');
  });

  it('buildSummary returns zh labels and completionRatio', () => {
    const summary = buildSummary({
      ...DEFAULT_DRIVER_PROFILE,
      experience: { ...DEFAULT_DRIVER_PROFILE.experience, snow: 'average', totalYears: 7 },
      qualification: {
        ...DEFAULT_DRIVER_PROFILE.qualification,
        hasValidLicense: true,
        issuingCountry: 'CN',
        licenseClasses: ['C1'],
        expiresOn: '2099-06-20',
      },
      longTermPrefs: {
        ...DEFAULT_DRIVER_PROFILE.longTermPrefs,
        comfortableDailyDrivingHours: 5,
        nightDrivingAcceptance: 'avoid',
      },
    });
    expect(summary.snowLabel).toBe('一般');
    expect(summary.nightDrivingLabel).toBe('尽量避免');
    expect(summary.experienceYears).toBe(7);
    expect(summary.completionRatio).toBeGreaterThan(0.5);
  });

  it('getSummary delegates to stored profile', async () => {
    const store = {
      readKey: jest.fn().mockResolvedValue({
        value: {
          qualification: {
            hasValidLicense: true,
            expiresOn: '2099-01-01',
            issuingCountry: 'CN',
            licenseClasses: ['C1'],
          },
          experience: { totalYears: 3, snow: 'limited' },
        },
        preferences: {},
        other: {},
        updatedAt: new Date(),
      }),
      mergeKey: jest.fn(),
    };
    const svc = new MobileDriverProfileService(store as never);
    const summary = await svc.getSummary('u1');
    expect(summary.qualificationStatus).toBe('valid');
    expect(summary.experienceYears).toBe(3);
  });
});
