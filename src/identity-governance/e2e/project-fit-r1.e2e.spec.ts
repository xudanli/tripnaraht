/**
 * E2E-IG-PFIT-R1: Project Fit full application flow
 */
import { PILOT_IDS, createProjectFitHarness } from './pilot-harness';

describe('E2E-IG-PFIT-R1: Project Fit application flow', () => {
  it('runs questionnaire → assess → apply → review → confirm', async () => {
    const h = createProjectFitHarness();
    const { guide, admin, memberId } = {
      ...PILOT_IDS,
      memberId: '55555555-5555-4555-8555-555555555555',
    };
    h.store.tables.users.push({ id: memberId, email: 'member@test.com', displayName: 'Member' });

    await h.professionalCertification.saveDraft(guide, {
      bio: 'Guide',
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
      title: 'Fit Flow Trek',
      destination: 'Iceland',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      summary: 'R1 fit test',
      commercialType: 'NON_COMMERCIAL',
      riskDisclosure: 'Risk',
      budgetMinCents: 400000,
      tripId: 'trip-fit-r1',
    });
    await h.trustedProjects.submitForReview(guide, listing.id as string);
    await h.trustedProjects.reviewListing(admin, listing.id as string, 'approve');

    await h.eligibilityRules.seedDefaultRules(guide, listing.id as string);

    const preview = await h.fitAssessment.getQuestionnaire(listing.id as string, 'preview');
    expect(preview.questions.length).toBeGreaterThan(0);

    const started = await h.fitAssessment.startAssessment(memberId, listing.id as string);
    await h.fitAssessment.saveAnswers(memberId, started.id as string, [
      { questionKey: 'dates_available', answer: true },
      { questionKey: 'budget_cents', answer: 500000, sensitivityLevel: 'HIGH' },
      { questionKey: 'pace_acceptance', answer: 4 },
      { questionKey: 'risk_acceptance', answer: 4 },
      { questionKey: 'accommodation_shared', answer: true },
      { questionKey: 'equipment_ready', answer: true },
    ]);
    const evaluated = await h.fitAssessment.evaluate(memberId, started.id as string);
    expect(evaluated.overallResult).not.toBe('NOT_RECOMMENDED');

    const application = await h.fitApplication.submitWithAssessment(memberId, listing.id as string, {
      fitAssessmentId: started.id as string,
      message: 'Ready to join',
    });
    expect(application.status).toBe('UNDER_REVIEW');

    const queue = await h.fitApplication.listReviewQueue(guide, listing.id as string);
    expect(queue.length).toBe(1);
    expect(queue[0].systemRecommendation).toBeDefined();

    await h.fitApplication.leaderDecision(guide, application.id as string, {
      decision: 'APPROVE',
    });

    const confirmed = await h.fitApplication.userConfirm(memberId, application.id as string);
    expect(confirmed.status).toBe('JOINED');

    const membership = h.store.findFirst('projectMemberships', {
      where: { tripId: 'trip-fit-r1', userId: memberId },
    });
    expect(membership?.status).toBe('ACTIVE');
    expect(membership?.roles).toEqual(['participant']);

    const collaborator = h.store.findFirst('tripCollaborators', {
      where: { tripId: 'trip-fit-r1', userId: memberId },
    });
    expect(collaborator?.role).toBe('member');
  });
});
