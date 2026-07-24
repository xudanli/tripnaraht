type PrivateNotesAuth = 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';

export type MemberOnboardingPendingReason =
  | 'onboarding_not_started'
  | 'onboarding_in_progress'
  | 'onboarding_not_submitted';

const SNAKE_CASE_ALIASES: Record<string, string> = {
  tripId: 'trip_id',
  userId: 'user_id',
  memberId: 'member_id',
  pendingMembers: 'pending_members',
  displayName: 'display_name',
  tripRole: 'trip_role',
  guardianFor: 'guardian_for',
  coreWishes: 'core_wishes',
  mustExperience: 'must_experience',
  avoidExperience: 'avoid_experience',
  pacePreference: 'pace_preference',
  earlyRiser: 'early_riser',
  maxDailyWalkKm: 'max_daily_walk_km',
  lodgingPreference: 'lodging_preference',
  dietRestrictions: 'diet_restrictions',
  healthNotes: 'health_notes',
  personalSpendingLevel: 'personal_spending_level',
  personalSpendingNotes: 'personal_spending_notes',
  acceptSplitGroup: 'accept_split_group',
  splitGroupNotes: 'split_group_notes',
  privateNotesAuth: 'private_notes_auth',
  advisorVisiblePrivateNotes: 'advisor_visible_private_notes',
  currentStepId: 'current_step_id',
  completedAt: 'completed_at',
  updatedAt: 'updated_at',
  submittedAt: 'submitted_at',
  roleSlot: 'role_slot',
  inviteToken: 'invite_token',
  label: 'label',
  reason: 'reason',
};

export function readStoredField(
  stored: Record<string, unknown>,
  camelKey: string,
): unknown {
  const snakeKey = SNAKE_CASE_ALIASES[camelKey];
  if (stored[camelKey] !== undefined) {
    return stored[camelKey];
  }
  if (snakeKey && stored[snakeKey] !== undefined) {
    return stored[snakeKey];
  }
  return undefined;
}

export function readStoredString(
  stored: Record<string, unknown>,
  camelKey: string,
  fallback = '',
): string {
  const value = readStoredField(stored, camelKey);
  return typeof value === 'string' ? value : fallback;
}

export function hasCompletedProfile(stored: unknown): boolean {
  if (!stored || typeof stored !== 'object') {
    return false;
  }
  const record = stored as Record<string, unknown>;
  const completedAt = readStoredField(record, 'completedAt');
  return typeof completedAt === 'string' && completedAt.trim().length > 0;
}

export function sanitizePrivateNotesForAdvisor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let sanitized = trimmed
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[邮箱已隐藏]')
    .replace(/\b1[3-9]\d{9}\b/g, '[电话已隐藏]');

  const maxLength = 200;
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength).trimEnd()}…`;
  }

  return sanitized;
}

export function resolveAdvisorVisiblePrivateNotes(
  stored: Record<string, unknown>,
): string | null {
  const auth = readStoredString(stored, 'privateNotesAuth', 'SANITIZED_TO_ADVISOR') as PrivateNotesAuth;
  if (auth === 'ANALYST_ONLY') {
    return null;
  }

  const precomputed = readStoredField(stored, 'advisorVisiblePrivateNotes');
  if (typeof precomputed === 'string' && precomputed.trim()) {
    return precomputed.trim();
  }

  const privateNotes = readStoredString(stored, 'privateNotes');
  return sanitizePrivateNotesForAdvisor(privateNotes);
}

export function resolvePendingReason(input: {
  draft: Record<string, unknown> | null;
  currentStepId?: string | null;
}): MemberOnboardingPendingReason {
  if (!input.draft) {
    return 'onboarding_not_started';
  }

  const displayName = readStoredString(input.draft, 'displayName').trim();
  if (displayName) {
    return 'onboarding_not_submitted';
  }

  if (hasMeaningfulDraftProgress(input.draft, input.currentStepId)) {
    return 'onboarding_in_progress';
  }

  return 'onboarding_not_started';
}

function hasMeaningfulDraftProgress(
  stored: Record<string, unknown>,
  currentStepId?: string | null,
): boolean {
  if (currentStepId?.trim()) {
    return true;
  }

  const scalarFields = [
    'guardianFor',
    'mustExperience',
    'avoidExperience',
    'lodgingPreference',
    'dietRestrictions',
    'healthNotes',
    'personalSpendingNotes',
    'splitGroupNotes',
    'privateNotes',
  ];

  if (
    scalarFields.some((key) => readStoredString(stored, key).trim().length > 0)
  ) {
    return true;
  }

  const coreWishes = readStoredField(stored, 'coreWishes');
  return Array.isArray(coreWishes) && coreWishes.some((item) => String(item).trim());
}

export function withSnakeCaseAliases<T extends Record<string, unknown>>(
  value: T,
): T & Record<string, unknown> {
  const projected: Record<string, unknown> = { ...value };

  for (const [camelKey, snakeKey] of Object.entries(SNAKE_CASE_ALIASES)) {
    if (projected[camelKey] !== undefined && projected[snakeKey] === undefined) {
      projected[snakeKey] = projected[camelKey];
    }
  }

  return projected as T & Record<string, unknown>;
}

export function projectSubmittedProfile(
  userId: string,
  stored: Record<string, unknown>,
  refs: { memberId?: string; inviteCode?: string },
): Record<string, unknown> {
  const advisorVisiblePrivateNotes = resolveAdvisorVisiblePrivateNotes(stored);

  const profile = {
    userId,
    memberId: refs.memberId,
    inviteToken: refs.inviteCode ?? readStoredString(stored, 'inviteToken'),
    displayName: readStoredString(stored, 'displayName'),
    tripRole: readStoredString(stored, 'tripRole', 'MEMBER'),
    guardianFor: readStoredString(stored, 'guardianFor'),
    coreWishes: Array.isArray(readStoredField(stored, 'coreWishes'))
      ? (readStoredField(stored, 'coreWishes') as string[])
      : [],
    mustExperience: readStoredString(stored, 'mustExperience'),
    avoidExperience: readStoredString(stored, 'avoidExperience'),
    pacePreference: readStoredString(stored, 'pacePreference', 'moderate'),
    earlyRiser: Boolean(readStoredField(stored, 'earlyRiser')),
    maxDailyWalkKm:
      typeof readStoredField(stored, 'maxDailyWalkKm') === 'number'
        ? (readStoredField(stored, 'maxDailyWalkKm') as number)
        : undefined,
    lodgingPreference: readStoredString(stored, 'lodgingPreference'),
    dietRestrictions: readStoredString(stored, 'dietRestrictions'),
    healthNotes: readStoredString(stored, 'healthNotes'),
    personalSpendingLevel: readStoredString(
      stored,
      'personalSpendingLevel',
      'moderate',
    ),
    personalSpendingNotes: readStoredString(stored, 'personalSpendingNotes'),
    acceptSplitGroup: readStoredString(stored, 'acceptSplitGroup', 'depends'),
    splitGroupNotes: readStoredString(stored, 'splitGroupNotes'),
    privateNotesAuth: readStoredString(
      stored,
      'privateNotesAuth',
      'SANITIZED_TO_ADVISOR',
    ),
    advisorVisiblePrivateNotes,
    roleSlot: readStoredString(stored, 'roleSlot'),
    label: readStoredString(stored, 'label'),
    completedAt: readStoredString(stored, 'completedAt'),
    submittedAt: readStoredString(stored, 'submittedAt'),
    updatedAt: readStoredString(stored, 'updatedAt'),
  };

  return withSnakeCaseAliases(profile);
}
