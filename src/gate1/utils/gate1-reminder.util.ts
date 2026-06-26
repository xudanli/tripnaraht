export const GATE1_ADVISOR_REMINDER_COOLDOWN_HOURS = 24;

export const GATE1_PREFERENCE_REMINDER = {
  initialDelayHours: 48,
  maxCount: 2,
  betweenRemindersHours: 48,
} as const;

export const GATE1_PROPOSAL_FEEDBACK_REMINDER = {
  delayAfterPublishHours: 24,
  maxPerCandidate: 1,
} as const;

export type ProposalReminderMeta = {
  proposalReminders?: Record<string, { count: number; lastAt: string }>;
  lastPreferenceReminderAt?: string;
  lastAdvisorReminderAt?: string;
};

export function parseParticipantMetadata(metadata: unknown): ProposalReminderMeta {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as ProposalReminderMeta;
}

export function shouldSendProposalFeedbackReminder(
  candidateId: string,
  publishedAt: Date | null,
  metadata: unknown,
  now = new Date(),
): boolean {
  if (!publishedAt) return false;
  const meta = parseParticipantMetadata(metadata);
  const record = meta.proposalReminders?.[candidateId];
  if (record && record.count >= GATE1_PROPOSAL_FEEDBACK_REMINDER.maxPerCandidate) {
    return false;
  }
  return (
    now.getTime() - publishedAt.getTime() >=
    GATE1_PROPOSAL_FEEDBACK_REMINDER.delayAfterPublishHours * 3600000
  );
}

export function bumpProposalReminderMeta(
  metadata: unknown,
  candidateId: string,
  now: Date,
): ProposalReminderMeta {
  const meta = parseParticipantMetadata(metadata);
  const proposalReminders = { ...(meta.proposalReminders ?? {}) };
  const prev = proposalReminders[candidateId];
  proposalReminders[candidateId] = {
    count: (prev?.count ?? 0) + 1,
    lastAt: now.toISOString(),
  };
  return { ...meta, proposalReminders };
}

export type PreferenceReminderCandidate = {
  id: string;
  reminderCount: number;
  consentedAt: Date | null;
  formStartedAt: Date | null;
  openedAt: Date | null;
  metadata: unknown;
};

export function getPreferenceReminderAnchor(participant: PreferenceReminderCandidate): Date | null {
  return participant.formStartedAt ?? participant.consentedAt ?? participant.openedAt;
}

export function getLastPreferenceReminderAt(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as { lastPreferenceReminderAt?: string }).lastPreferenceReminderAt;
  return raw ? new Date(raw) : null;
}

export function shouldSendPreferenceReminder(
  participant: PreferenceReminderCandidate,
  now = new Date(),
): boolean {
  if (participant.reminderCount >= GATE1_PREFERENCE_REMINDER.maxCount) {
    return false;
  }

  const anchor = getPreferenceReminderAnchor(participant);
  if (!anchor) return false;

  const ms = now.getTime();
  const initialDue =
    ms - anchor.getTime() >= GATE1_PREFERENCE_REMINDER.initialDelayHours * 3600000;

  if (participant.reminderCount === 0) {
    return initialDue;
  }

  const lastReminder = getLastPreferenceReminderAt(participant.metadata);
  if (!lastReminder) {
    return initialDue;
  }

  return (
    ms - lastReminder.getTime() >= GATE1_PREFERENCE_REMINDER.betweenRemindersHours * 3600000
  );
}

export function canSendAdvisorInitiatedReminder(metadata: unknown, now = new Date()): boolean {
  if (!metadata || typeof metadata !== 'object') return true;
  const raw = (metadata as { lastAdvisorReminderAt?: string }).lastAdvisorReminderAt;
  if (!raw) return true;
  return now.getTime() - new Date(raw).getTime() >= GATE1_ADVISOR_REMINDER_COOLDOWN_HOURS * 3600000;
}
