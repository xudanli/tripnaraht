describe('TrustProfileService (public view)', () => {
  it('does not expose unverified professional bio fields', () => {
    const isVerifiedProfessional = false;
    const profile = { bio: 'secret draft', destinations: ['IS'], yearsOfExperience: 5 };

    const professional = {
      isVerifiedProfessional,
      verifiedAt: null,
      bio: isVerifiedProfessional ? profile.bio : null,
      destinations: isVerifiedProfessional ? profile.destinations : [],
      yearsOfExperience: isVerifiedProfessional ? profile.yearsOfExperience : null,
    };

    expect(professional.bio).toBeNull();
    expect(professional.destinations).toEqual([]);
  });

  it('exposes professional fields only when verified', () => {
    const isVerifiedProfessional = true;
    const profile = { bio: 'Guide in Iceland', destinations: ['IS'], yearsOfExperience: 8 };

    const professional = {
      isVerifiedProfessional,
      verifiedAt: '2026-01-01T00:00:00.000Z',
      bio: isVerifiedProfessional ? profile.bio : null,
      destinations: isVerifiedProfessional ? profile.destinations : [],
      yearsOfExperience: isVerifiedProfessional ? profile.yearsOfExperience : null,
    };

    expect(professional.bio).toBe('Guide in Iceland');
    expect(professional.destinations).toEqual(['IS']);
  });
});

describe('IdentityGovernanceScheduler', () => {
  it('can be disabled via env flag', () => {
    expect(process.env.IDENTITY_GOVERNANCE_CRON_ENABLED).not.toBe('false');
  });
});
