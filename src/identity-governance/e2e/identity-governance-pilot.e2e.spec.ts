/**
 * E2E Pilot — Identity Governance trust path
 *
 * Flow: Professional 认证 → 发布权限 → 可信项目 → 行程完成 → 声誉事实 → 机构背书 → 信任档案
 *
 * Uses in-memory Prisma harness (no live DB). Test ID prefix: E2E-IG-PILOT
 */
import { PILOT_IDS, createPilotHarness } from './pilot-harness';

describe('E2E-IG-PILOT: Identity governance pilot flow', () => {
  it('walks certification → publishing → trusted project → reputation → endorsement', async () => {
    const h = createPilotHarness();
    const { guide, admin, org, orgOwner, trip } = PILOT_IDS;

    // ── Step 1: Professional certification ──────────────────────────────
    await h.professionalCertification.saveDraft(guide, {
      bio: 'Iceland highland guide with 10 years experience',
      destinations: ['IS'],
      yearsOfExperience: 10,
      experienceSummary: 'Led 40+ highland expeditions',
    });
    await h.professionalCertification.submit(guide);

    const certRow = h.store.findFirst('professionalCertifications', {
      where: { userId: guide },
    });
    expect(certRow?.status).toBe('UNDER_REVIEW');

    await h.professionalCertification.review(admin, certRow!.id as string, 'approve');
    const verified = await h.professionalCertification.getStatus(guide);
    expect(verified.isVerifiedProfessional).toBe(true);

    // ── Step 2: Publishing permission ───────────────────────────────────
    const permissionBefore = await h.publishingPermission.getUserPermission(guide);
    expect(permissionBefore.level).toBe('PRIVATE_ONLY');

    const pubApp = await h.publishingPermission.submitApplication(
      guide,
      'PUBLIC_NON_COMMERCIAL',
      'Pilot non-commercial listings',
    );
    expect(pubApp.status).toBe('PENDING');

    await h.publishingPermission.reviewApplication(admin, pubApp.id as string, 'approve');
    const permissionAfter = await h.publishingPermission.getUserPermission(guide);
    expect(permissionAfter.level).toBe('PUBLIC_NON_COMMERCIAL');

    // ── Step 3: Trusted project listing ─────────────────────────────────
    const listing = await h.trustedProjects.createDraft(guide, {
      title: 'Iceland Highlands Pilot Trek',
      destination: 'Iceland',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      summary: 'Small-group highland trek with certified guide',
      commercialType: 'NON_COMMERCIAL',
      slotsTotal: 6,
      riskDisclosure: 'Weather and F-road closures may alter route',
      tripId: trip,
    });
    expect(listing.reviewStatus).toBe('DRAFT');

    await h.trustedProjects.submitForReview(guide, listing.id as string);
    const submitted = h.store.findUnique('trustedProjectListings', { where: { id: listing.id } });
    expect(submitted?.reviewStatus).toBe('UNDER_REVIEW');

    await h.trustedProjects.reviewListing(admin, listing.id as string, 'approve');
    const published = h.store.findUnique('trustedProjectListings', { where: { id: listing.id } });
    expect(published?.listingStatus).toBe('published');

    // ── Step 4: Trip completion → reputation facts ──────────────────────
    await h.reputation.recordTrustedProjectCompletion(trip, {
      success: 'GOOD',
      overallScore: 0.82,
    });

    const reputationSummary = await h.reputation.getFactsSummary('USER', guide);
    expect(reputationSummary.facts.projectsCompleted).toBe(1);
    expect(reputationSummary.facts.lastProjectCompletedAt).not.toBeNull();
    expect(reputationSummary).not.toHaveProperty('compositeScore');

    const reputationEvents = h.store.findMany('reputationEvents', {
      where: { listingId: listing.id, eventType: 'PROJECT_COMPLETED' },
    });
    expect(reputationEvents.length).toBeGreaterThanOrEqual(1);

    // ── Step 5: Institutional endorsement (post-completion) ───────────
    const endorsementDraft = await h.endorsement.submit(orgOwner, {
      endorserSubjectType: 'ORGANIZATION',
      endorserSubjectId: org,
      subjectType: 'USER',
      subjectId: guide,
      endorsementType: 'PROJECT_LEADERSHIP',
      factStatement:
        'Led Iceland Highlands Pilot Trek to completion with zero safety incidents and full itinerary delivery.',
      relatedListingId: listing.id as string,
      relatedTripId: trip,
    });
    expect(endorsementDraft.status).toBe('PENDING');

    await h.endorsement.review(admin, endorsementDraft.id as string, 'activate');
    const activeEndorsements = await h.endorsement.listForSubject('USER', guide);
    expect(activeEndorsements).toHaveLength(1);
    expect(activeEndorsements[0].endorsementType).toBe('PROJECT_LEADERSHIP');

    // ── Step 6: Aggregated trust profile (no composite score) ─────────
    const profile = await h.trustProfile.getPublicUserProfile(guide);
    expect(profile.professional?.isVerifiedProfessional).toBe(true);
    expect(profile.professional?.bio).toContain('Iceland');
    expect(profile.verification.emailVerified).toBe(true);
    expect(profile.reputationFacts.projectsCompleted).toBe(1);
    expect(profile.endorsements).toHaveLength(1);
    expect(profile).not.toHaveProperty('creditScore');
    expect(profile).not.toHaveProperty('compositeScore');

    const myProfile = await h.trustProfile.getMyProfile(guide);
    expect(myProfile.pendingEndorsementsReceived).toBe(0);
  });

  it('E2E-IG-PILOT-002: blocks trusted project before publishing permission', async () => {
    const h = createPilotHarness();
    const { guide } = PILOT_IDS;

    await expect(
      h.trustedProjects.createDraft(guide, {
        title: 'Unauthorized Listing',
        destination: 'Iceland',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        summary: 'Should fail without publish permission',
        commercialType: 'NON_COMMERCIAL',
        riskDisclosure: 'Risk note',
      }),
    ).rejects.toThrow(/发布权限|公开发布/);
  });

  it('E2E-IG-PILOT-003: blocks endorsement before project completion', async () => {
    const h = createPilotHarness();
    const { guide, admin, org, orgOwner, trip } = PILOT_IDS;

    await h.professionalCertification.saveDraft(guide, {
      bio: 'Guide bio',
      destinations: ['IS'],
      yearsOfExperience: 5,
    });
    await h.professionalCertification.submit(guide);
    const cert = h.store.findFirst('professionalCertifications', { where: { userId: guide } });
    await h.professionalCertification.review(admin, cert!.id as string, 'approve');

    const pubApp = await h.publishingPermission.submitApplication(
      guide,
      'PUBLIC_NON_COMMERCIAL',
      'pilot',
    );
    await h.publishingPermission.reviewApplication(admin, pubApp.id as string, 'approve');

    const listing = await h.trustedProjects.createDraft(guide, {
      title: 'Incomplete Trek',
      destination: 'Iceland',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      summary: 'Not yet completed',
      commercialType: 'NON_COMMERCIAL',
      riskDisclosure: 'Risk',
      tripId: trip,
    });
    await h.trustedProjects.submitForReview(guide, listing.id as string);
    await h.trustedProjects.reviewListing(admin, listing.id as string, 'approve');

    await expect(
      h.endorsement.submit(orgOwner, {
        endorserSubjectType: 'ORGANIZATION',
        endorserSubjectId: org,
        subjectType: 'USER',
        subjectId: guide,
        endorsementType: 'SAFETY_PRACTICES',
        factStatement: 'Premature endorsement before trip completion event.',
        relatedListingId: listing.id as string,
      }),
    ).rejects.toThrow(/尚未完成/);
  });

  it('E2E-IG-PILOT-004: records provider cancel and member withdraw reputation events', async () => {
    const h = createPilotHarness();
    const { guide, admin, trip } = PILOT_IDS;
    const memberId = '55555555-5555-4555-8555-555555555555';

    h.store.tables.users.push({
      id: memberId,
      email: 'member@pilot.test',
      displayName: 'Pilot Member',
    });

    await h.professionalCertification.saveDraft(guide, {
      bio: 'Guide',
      destinations: ['IS'],
      yearsOfExperience: 3,
    });
    await h.professionalCertification.submit(guide);
    const cert = h.store.findFirst('professionalCertifications', { where: { userId: guide } });
    await h.professionalCertification.review(admin, cert!.id as string, 'approve');

    const pubApp = await h.publishingPermission.submitApplication(
      guide,
      'PUBLIC_NON_COMMERCIAL',
      'pilot',
    );
    await h.publishingPermission.reviewApplication(admin, pubApp.id as string, 'approve');

    const listing = await h.trustedProjects.createDraft(guide, {
      title: 'Withdrawal Test Trek',
      destination: 'Iceland',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      summary: 'Member flow test',
      commercialType: 'NON_COMMERCIAL',
      riskDisclosure: 'Risk',
      tripId: trip,
      slotsTotal: 4,
    });
    await h.trustedProjects.submitForReview(guide, listing.id as string);
    await h.trustedProjects.reviewListing(admin, listing.id as string, 'approve');

    await h.trustedProjects.submitApplication(memberId, listing.id as string, 'Join please');
    const application = h.store.findFirst('trustedProjectApplications', {
      where: { listingId: listing.id, applicantUserId: memberId },
    });
    await h.trustedProjects.reviewApplication(
      guide,
      listing.id as string,
      application!.id as string,
      'approve',
    );

    await h.trustedProjects.withdrawMembership(memberId, listing.id as string);

    const memberSummary = await h.reputation.getFactsSummary('USER', memberId);
    expect(memberSummary.facts.memberWithdrawals).toBe(1);

    await h.trustedProjects.closeListing(guide, listing.id as string, 'Weather cancellation');

    const guideSummary = await h.reputation.getFactsSummary('USER', guide);
    expect(guideSummary.facts.projectsCancelledByProvider).toBe(1);
  });
});
