import {
  hasCompletedProfile,
  projectSubmittedProfile,
  resolveAdvisorVisiblePrivateNotes,
  resolvePendingReason,
  sanitizePrivateNotesForAdvisor,
  withSnakeCaseAliases,
} from './member-onboarding-profile.projection.util';

describe('member-onboarding-profile.projection.util', () => {
  it('hasCompletedProfile accepts camelCase and snake_case completedAt', () => {
    expect(hasCompletedProfile({ completedAt: '2026-07-10T00:00:00.000Z' })).toBe(true);
    expect(hasCompletedProfile({ completed_at: '2026-07-10T00:00:00.000Z' })).toBe(true);
    expect(hasCompletedProfile({ completedAt: '' })).toBe(false);
  });

  it('resolveAdvisorVisiblePrivateNotes hides ANALYST_ONLY notes', () => {
    expect(
      resolveAdvisorVisiblePrivateNotes({
        privateNotes: 'secret',
        privateNotesAuth: 'ANALYST_ONLY',
      }),
    ).toBeNull();
  });

  it('resolveAdvisorVisiblePrivateNotes returns sanitized summary for advisor-visible notes', () => {
    const summary = resolveAdvisorVisiblePrivateNotes({
      privateNotes: '希望顾问知道我对早起敏感，邮箱 test@example.com',
      privateNotesAuth: 'SANITIZED_TO_ADVISOR',
    });

    expect(summary).toContain('[邮箱已隐藏]');
    expect(summary).not.toContain('test@example.com');
  });

  it('sanitizePrivateNotesForAdvisor truncates long notes', () => {
    const longText = 'a'.repeat(250);
    const summary = sanitizePrivateNotesForAdvisor(longText);
    expect(summary).toHaveLength(201);
    expect(summary?.endsWith('…')).toBe(true);
  });

  it('projectSubmittedProfile never exposes privateNotes', () => {
    const profile = projectSubmittedProfile(
      'user-1',
      {
        displayName: 'Alice',
        tripRole: 'MEMBER',
        privateNotes: 'raw secret',
        privateNotesAuth: 'SANITIZED_TO_ADVISOR',
        completedAt: '2026-07-10T00:00:00.000Z',
      },
      { memberId: 'member-1' },
    );

    expect(profile).not.toHaveProperty('privateNotes');
    expect(profile).not.toHaveProperty('private_notes');
    expect(profile.advisorVisiblePrivateNotes).toBeTruthy();
    expect(profile.advisor_visible_private_notes).toBe(profile.advisorVisiblePrivateNotes);
  });

  it('resolvePendingReason distinguishes not started, in progress, and not submitted', () => {
    expect(resolvePendingReason({ draft: null })).toBe('onboarding_not_started');

    expect(
      resolvePendingReason({
        draft: { mustExperience: '看极光' },
        currentStepId: 'preferences',
      }),
    ).toBe('onboarding_in_progress');

    expect(
      resolvePendingReason({
        draft: { displayName: 'Bob' },
      }),
    ).toBe('onboarding_not_submitted');
  });

  it('withSnakeCaseAliases mirrors camelCase fields', () => {
    const projected = withSnakeCaseAliases({
      tripId: 'trip-1',
      pendingMembers: [],
    });

    expect(projected.trip_id).toBe('trip-1');
    expect(projected.pending_members).toEqual([]);
  });
});
