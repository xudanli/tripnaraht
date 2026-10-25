import {
  projectMobileDetail,
  projectMobileExtras,
} from './admin-user-enrichment.util';

describe('admin-user-enrichment', () => {
  it('returns empty extras when preferences missing', () => {
    const extras = projectMobileExtras(null);
    expect(extras.identity).toBeNull();
    expect(extras.travelPortrait).toBeNull();
    expect(extras.driverSummary).toBeNull();
    expect(extras.emergencyContactCount).toBe(0);
    expect(extras.hasIdentity).toBe(false);
  });

  it('projects iOS identity / portrait / driver / emergency from other', () => {
    const extras = projectMobileExtras({
      nationality: 'CN',
      other: {
        identity: {
          phone: '+8613800138000',
          legalFullName: '张三',
          dateOfBirth: '1990-01-02',
          nationality: 'CN',
          residencyRegion: 'CN-BJ',
          preferredLanguage: 'zh-Hans',
        },
        travelPortrait: {
          pace: { travelPace: 'relaxed' },
          accessibility: { hasChildrenNeeds: true, motionSickness: true },
        },
        driverProfile: {
          qualification: {
            hasValidLicense: true,
            expiresOn: '2099-01-01',
            verificationStatus: 'verified',
          },
          experience: { totalYears: 5, snow: 'average' },
          longTermPrefs: { nightDrivingAcceptance: 'avoid' },
        },
        emergencyContacts: [{ id: 'ec_1', name: 'A', phone: '1' }],
      },
    });

    expect(extras.identity?.phone).toBe('+8613800138000');
    expect(extras.identity?.nationality).toBe('CN');
    expect(extras.travelPortrait?.travelPace).toBe('relaxed');
    expect(extras.travelPortrait?.hasChildrenNeeds).toBe(true);
    expect(extras.driverSummary?.experienceYears).toBe(5);
    expect(extras.driverSummary?.qualificationStatus).toBe('valid');
    expect(extras.emergencyContactCount).toBe(1);
    expect(extras.hasDriverProfile).toBe(true);
  });

  it('falls back nationality from legacy preferences when identity missing nationality', () => {
    const extras = projectMobileExtras({
      nationality: 'IS',
      residencyCountry: 'IS',
      other: {
        identity: { phone: '123' },
      },
    });
    expect(extras.identity?.nationality).toBe('IS');
    expect(extras.identity?.residencyRegion).toBe('IS');
  });

  it('projectMobileDetail merges defaults for stored portrait/driver', () => {
    const detail = projectMobileDetail({
      other: {
        travelPortrait: { pace: { travelPace: 'packed' } },
        driverProfile: { experience: { totalYears: 2 } },
        emergencyContacts: [{ id: 'x' }],
      },
    });
    expect(detail.travelPortrait).toMatchObject({
      pace: expect.objectContaining({ travelPace: 'packed' }),
    });
    expect(detail.driverProfile).toMatchObject({
      experience: expect.objectContaining({ totalYears: 2 }),
    });
    expect(detail.emergencyContacts).toHaveLength(1);
  });
});
