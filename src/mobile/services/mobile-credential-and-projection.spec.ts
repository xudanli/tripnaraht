import {
  applyUserDrivingDefaults,
  enrichCandidatesFromProjections,
  loadUserDrivingDefaultsProjection,
  type UserDrivingDefaultsProjection,
} from '../../trips/iceland-self-drive/services/iceland-self-drive-user-defaults-projection.util';
import { buildInitialDrivingSettings } from '../../trips/iceland-self-drive/services/iceland-self-drive-completion.util';
import { MobileCredentialStatusService } from './mobile-credential-status.service';
import { ForbiddenException } from '@nestjs/common';

describe('iceland user driving defaults projection', () => {
  const projection: UserDrivingDefaultsProjection = {
    members: { hasChildren: true, hasElderly: false, motionSickness: true },
    routePreference: {
      pacePreference: 'safe',
      restFrequency: 'frequent',
      gravelTolerance: 'low',
      allowNightDriving: false,
      nightDrivingPreference: 'avoid',
      fRoadPreference: 'avoid',
      dailyDrivingLimitHours: 4,
    },
    drivers: {
      dailyDrivingLimitHours: 4,
      snowExperience: 'familiar',
      gravelExperience: 'average',
      nightAcceptance: 'avoid',
    },
  };

  it('buildInitialDrivingSettings applies projection', () => {
    const settings = buildInitialDrivingSettings('rent', projection);
    expect(settings.members.hasChildren).toBe(true);
    expect(settings.members.motionSickness).toBe(true);
    expect(settings.routePreference.pacePreference).toBe('safe');
    expect(settings.routePreference.restFrequency).toBe('frequent');
    expect(settings.routePreference.gravelTolerance).toBe('low');
    expect(settings.drivers.dailyDrivingLimitHours).toBe(4);
    expect(settings.drivers.candidates).toEqual([]);
  });

  it('applyUserDrivingDefaults is no-op when null', () => {
    const base = buildInitialDrivingSettings('rent');
    expect(applyUserDrivingDefaults(base, null)).toEqual(base);
  });

  it('enrichCandidatesFromProjections fills only null fields', () => {
    const enriched = enrichCandidatesFromProjections(
      [
        {
          memberId: 'u1',
          isSelected: true,
          role: 'main',
          snowExperience: null,
          gravelExperience: 'limited',
          nightAcceptance: null,
          isAdditionalDriver: false,
        },
      ],
      new Map([['u1', projection]]),
    );
    expect(enriched[0]?.snowExperience).toBe('familiar');
    expect(enriched[0]?.gravelExperience).toBe('limited');
    expect(enriched[0]?.nightAcceptance).toBe('avoid');
  });

  it('loadUserDrivingDefaultsProjection maps portrait enums', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          preferences: {
            other: {
              travelPortrait: {
                pace: { travelPace: 'relaxed', restFrequency: 'high' },
                accessibility: {
                  hasChildrenNeeds: true,
                  hasElderlyNeeds: false,
                  motionSickness: false,
                },
                drivingDefaults: {
                  comfortableDailyDrivingHours: 6,
                  nightDrivingAcceptance: 'ok',
                  gravelAcceptance: 'high',
                  preferAvoidFRoad: false,
                },
              },
              driverProfile: {
                experience: { snow: 'extensive', gravel: 'average' },
                longTermPrefs: { nightDrivingAcceptance: 'limited' },
              },
            },
          },
        }),
      },
    };
    const p = await loadUserDrivingDefaultsProjection(prisma as never, 'u1');
    expect(p?.routePreference.pacePreference).toBe('safe');
    expect(p?.routePreference.restFrequency).toBe('frequent');
    expect(p?.routePreference.allowNightDriving).toBe(true);
    expect(p?.routePreference.nightDrivingPreference).toBe('accept');
    expect(p?.routePreference.fRoadPreference).toBe('conditional');
    expect(p?.drivers.snowExperience).toBe('familiar');
    expect(p?.members.hasChildren).toBe(true);
  });
});

describe('MobileCredentialStatusService', () => {
  it('requires organizer and returns status without file URLs', async () => {
    const access = {
      assertOrganizer: jest.fn().mockResolvedValue({}),
    };
    const documents = {
      getStatusByTypes: jest.fn().mockResolvedValue(
        new Map([
          ['drivers_license', 'verified'],
          ['international_permit', 'pending'],
        ]),
      ),
    };
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          TripCollaborator: [{ userId: 'm_danny' }],
          metadata: {
            icelandSelfDrive: {
              wizard: { vehicleAcquisition: 'rent' },
              drivingSettings: {
                drivers: {
                  candidates: [
                    {
                      memberId: 'm_danny',
                      isSelected: true,
                      role: 'additional',
                      isAdditionalDriver: true,
                      snowExperience: null,
                      gravelExperience: null,
                      nightAcceptance: null,
                    },
                  ],
                },
              },
            },
          },
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ displayName: 'Danny' }),
      },
    };
    const svc = new MobileCredentialStatusService(
      prisma as never,
      access as never,
      documents as never,
    );
    const res = await svc.getMemberCredentialStatus('owner', 'trip-1', 'm_danny');
    expect(access.assertOrganizer).toHaveBeenCalledWith('trip-1', 'owner');
    expect(res.displayName).toBe('Danny');
    expect(res.items.find((i) => i.type === 'drivers_license')?.status).toBe('verified');
    expect(res.items.find((i) => i.type === 'additional_driver_registration')?.status).toBe(
      'pending',
    );
    expect(JSON.stringify(res)).not.toMatch(/signedUrl|storageKey|fileUrl/);
  });

  it('rejects when target is not a trip member', async () => {
    const access = { assertOrganizer: jest.fn().mockResolvedValue({}) };
    const documents = { getStatusByTypes: jest.fn() };
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          TripCollaborator: [{ userId: 'other' }],
          metadata: {},
        }),
      },
      user: { findUnique: jest.fn() },
    };
    const svc = new MobileCredentialStatusService(
      prisma as never,
      access as never,
      documents as never,
    );
    await expect(
      svc.getMemberCredentialStatus('owner', 'trip-1', 'ghost'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
