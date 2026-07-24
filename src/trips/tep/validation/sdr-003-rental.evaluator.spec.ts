import type { DailyDrivePlan, SelfDriveProfile } from '../contracts/tep-self-drive.types';
import { evaluateSdr003RentalContractRestrictions } from './sdr-003-rental.evaluator';

const isRentalRestrictions: SelfDriveProfile['rentalRestrictions'] = [
  {
    code: 'NO_F_ROAD',
    description: '标准租车合同禁止驶入 F-road（高地路）',
    source: 'PACK_DEFAULT',
  },
  {
    code: 'GRAVEL_ROAD_LIMITED',
    description: '碎石路行驶受合同里程/险种限制',
    source: 'PACK_DEFAULT',
  },
];

const profile4wd: SelfDriveProfile = {
  vehicle: { vehicleType: '4WD', vehicleSource: 'EXPLORATION' },
  drivers: [{ driverId: 'primary', experienceLevel: 'EXPERIENCED' }],
  drivingPolicy: {
    nightDrivingAllowed: true,
    nightDrivingPreference: 'ALLOW_WITH_CAUTION',
  },
  rentalRestrictions: isRentalRestrictions,
};

describe('evaluateSdr003RentalContractRestrictions', () => {
  it('rejects F-road when rental contract forbids NO_F_ROAD (IS-CERT-004)', () => {
    const day: DailyDrivePlan = {
      date: '2026-08-02',
      dayIndex: 1,
      origin: { ref: 'anchor_a', label: 'Vik' },
      destination: { ref: 'anchor_b', label: 'Highlands' },
      legs: [
        {
          legId: 'drive_leg_1_1',
          fromRef: 'item_a',
          toRef: 'item_b',
          baseNavigationMinutes: 120,
          roadRefs: ['segment:cert_004:F208'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr003RentalContractRestrictions({
      profile: profile4wd,
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const fRoad = results.find((r) => r.outcome === 'REJECT' && r.explanation.includes('NO_F_ROAD'));
    expect(fRoad).toBeDefined();
    expect(fRoad?.ruleId).toBe('SDR-003');
    expect(fRoad?.affectedRefs).toContain('drive_leg_1_1');
  });

  it('rejects when gravel ratio exceeds contract threshold', () => {
    const day: DailyDrivePlan = {
      date: '2026-08-05',
      dayIndex: 1,
      origin: { ref: 'anchor_a', label: 'A' },
      destination: { ref: 'anchor_b', label: 'B' },
      legs: [
        {
          legId: 'drive_leg_1_1',
          fromRef: 'item_a',
          toRef: 'item_b',
          baseNavigationMinutes: 60,
          roadRefs: ['segment:cert_105:RING_ROAD'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
        {
          legId: 'drive_leg_1_2',
          fromRef: 'item_b',
          toRef: 'item_c',
          baseNavigationMinutes: 40,
          roadRefs: ['segment:cert_105:F26'],
          importance: 'RECOMMENDED',
          flexibility: 'REMOVABLE',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr003RentalContractRestrictions({
      profile: profile4wd,
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const gravel = results.find((r) => r.explanation.includes('GRAVEL_ROAD_LIMITED'));
    expect(gravel?.outcome).toBe('REJECT');
  });

  it('needs confirm for low gravel share below threshold', () => {
    const day: DailyDrivePlan = {
      date: '2026-08-05',
      dayIndex: 1,
      origin: { ref: 'anchor_a', label: 'A' },
      destination: { ref: 'anchor_b', label: 'B' },
      legs: [
        {
          legId: 'drive_leg_1_1',
          fromRef: 'item_a',
          toRef: 'item_b',
          baseNavigationMinutes: 180,
          roadRefs: ['segment:cert_106:RING_ROAD'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
        {
          legId: 'drive_leg_1_2',
          fromRef: 'item_b',
          toRef: 'item_c',
          baseNavigationMinutes: 20,
          roadRefs: ['segment:cert_106:F26'],
          importance: 'OPTIONAL',
          flexibility: 'REMOVABLE',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr003RentalContractRestrictions({
      profile: profile4wd,
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const gravel = results.find((r) => r.explanation.includes('GRAVEL_ROAD_LIMITED'));
    expect(gravel?.outcome).toBe('NEED_CONFIRM');
  });

  it('skips when profile has no rental restrictions', () => {
    const results = evaluateSdr003RentalContractRestrictions({
      profile: { ...profile4wd, rentalRestrictions: undefined },
      dailyDrivePlans: [],
      countryCode: 'IS',
    });
    expect(results).toHaveLength(0);
  });

  it('needs confirm for unmapped user-declared restriction codes', () => {
    const day: DailyDrivePlan = {
      date: '2026-08-06',
      dayIndex: 1,
      origin: { ref: 'anchor_a', label: 'A' },
      destination: { ref: 'anchor_b', label: 'B' },
      legs: [
        {
          legId: 'drive_leg_1_1',
          fromRef: 'item_a',
          toRef: 'item_b',
          baseNavigationMinutes: 60,
          roadRefs: ['segment:cert_custom:RING_ROAD'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr003RentalContractRestrictions({
      profile: {
        ...profile4wd,
        rentalRestrictions: [
          {
            code: 'CUSTOM_EXCLUSION_ZONE',
            description: '合同排除特定区域',
            source: 'USER_DECLARED',
          },
        ],
      },
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    expect(results[0]?.outcome).toBe('NEED_CONFIRM');
    expect(results[0]?.degradationReason).toBe('RENTAL_RESTRICTION_UNMAPPED');
  });
});
