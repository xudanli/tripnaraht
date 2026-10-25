/**
 * PD-7 — Change Draft lifecycle: Preview → Confirm → Apply.
 * Forbidden: Recommendation → auto Apply.
 */

import type { ChangeDraftCardV1 } from '../../../agent/delivery/conversation/conversation-turn-result.types';
import type { ProactiveReminderCtaId } from '../surface/proactive-reminder-card.types';
import type {
  ProactiveApplyReceiptV1,
  ProactiveChangeDraftV1,
  ProactiveCtaResultV1,
} from './proactive-change-draft.types';

export class ProactiveDraftLifecycleError extends Error {
  readonly code:
    | 'NO_DRAFT'
    | 'INVALID_STATUS'
    | 'VERIFY_FAILED'
    | 'APPLY_BEFORE_CONFIRM'
    | 'CONFIRM_BEFORE_PREVIEW'
    | 'ALREADY_TERMINAL';

  constructor(
    code: ProactiveDraftLifecycleError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ProactiveDraftLifecycleError';
    this.code = code;
  }
}

function touch(
  draft: ProactiveChangeDraftV1,
  patch: Partial<ProactiveChangeDraftV1>,
): ProactiveChangeDraftV1 {
  return {
    ...draft,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function withApplyGate(
  card: ChangeDraftCardV1,
  gate: NonNullable<ChangeDraftCardV1['apply_gate']>,
): ChangeDraftCardV1 {
  return { ...card, apply_gate: gate };
}

/**
 * VIEW_OPTIONS → enter Preview (WAIT_CONFIRM), still applyAllowed=false.
 */
export function openProactiveDraftPreview(
  draft: ProactiveChangeDraftV1,
): ProactiveChangeDraftV1 {
  if (draft.status === 'APPLIED' || draft.status === 'CANCELLED') {
    throw new ProactiveDraftLifecycleError(
      'ALREADY_TERMINAL',
      `Cannot preview terminal draft status=${draft.status}`,
    );
  }
  if (draft.status === 'DEFERRED') {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'Deferred draft cannot re-enter preview without new recommendation',
    );
  }
  if (!draft.verifyOk) {
    throw new ProactiveDraftLifecycleError(
      'VERIFY_FAILED',
      'Cannot preview unverified draft',
    );
  }

  return touch(draft, {
    status: 'WAIT_CONFIRM',
    applyAllowed: false,
    changeDraftCard: withApplyGate(draft.changeDraftCard, {
      can_apply: false,
      apply_path: 'rfc001/decision-finalize',
      deny_reason: 'awaiting_confirm',
      flawed_draft_forbidden: true,
    }),
  });
}

/** Confirm：锁定草案，仍不写行程 */
export function confirmProactiveChangeDraft(
  draft: ProactiveChangeDraftV1,
): ProactiveChangeDraftV1 {
  if (draft.status !== 'WAIT_CONFIRM') {
    throw new ProactiveDraftLifecycleError(
      'CONFIRM_BEFORE_PREVIEW',
      `Confirm requires WAIT_CONFIRM (got ${draft.status})`,
    );
  }
  if (!draft.verifyOk) {
    throw new ProactiveDraftLifecycleError(
      'VERIFY_FAILED',
      'Cannot confirm unverified draft',
    );
  }

  return touch(draft, {
    status: 'CONFIRMED',
    applyAllowed: true,
    changeDraftCard: withApplyGate(draft.changeDraftCard, {
      can_apply: true,
      apply_path: 'rfc001/decision-finalize',
      flawed_draft_forbidden: true,
    }),
  });
}

export type ProactiveApplyPort = (draft: ProactiveChangeDraftV1) => Promise<{
  ok: boolean;
  actionId?: string;
  planVersionId?: string;
  /** false when shadow / no PlanVersion materialize */
  appliedToItinerary?: boolean;
  shadowMode?: boolean;
  errorZh?: string;
}>;

/**
 * Apply：须已 Confirm；委托 RFC-001 finalize applyPort（禁止静默写）。
 */
export async function applyProactiveChangeDraft(
  draft: ProactiveChangeDraftV1,
  applyPort: ProactiveApplyPort,
): Promise<ProactiveChangeDraftV1> {
  if (draft.status === 'APPLIED' && draft.receipt) {
    return draft;
  }
  if (draft.status !== 'CONFIRMED' || !draft.applyAllowed) {
    throw new ProactiveDraftLifecycleError(
      'APPLY_BEFORE_CONFIRM',
      `Apply forbidden until CONFIRMED (status=${draft.status})`,
    );
  }

  const result = await applyPort(draft);
  if (!result.ok) {
    throw new Error(result.errorZh ?? '[ProactiveDraft] RFC001 apply failed');
  }

  const appliedToItinerary =
    result.appliedToItinerary ?? Boolean(result.planVersionId);

  const receipt: ProactiveApplyReceiptV1 = {
    actionId: result.actionId ?? `act_${draft.draftId}`,
    appliedAt: new Date().toISOString(),
    decisionProblemId: draft.decisionProblemId,
    planVersionId: result.planVersionId,
    appliedToItinerary,
    authority: 'RFC001_FINALIZE',
  };

  return touch(draft, {
    status: 'APPLIED',
    applyAllowed: false,
    receipt,
    changeDraftCard: {
      ...withApplyGate(draft.changeDraftCard, {
        can_apply: false,
        apply_path: 'rfc001/decision-finalize',
        deny_reason: 'already_applied',
        flawed_draft_forbidden: true,
      }),
      applied: true,
    },
  });
}

/** 暂不调整 */
export function deferProactiveChangeDraft(
  draft: ProactiveChangeDraftV1,
  cooldownHours = 6,
): { draft: ProactiveChangeDraftV1; cooldownHours: number } {
  if (draft.status === 'APPLIED') {
    throw new ProactiveDraftLifecycleError(
      'ALREADY_TERMINAL',
      'Cannot defer applied draft',
    );
  }
  return {
    draft: touch(draft, {
      status: 'DEFERRED',
      applyAllowed: false,
      changeDraftCard: withApplyGate(draft.changeDraftCard, {
        can_apply: false,
        deny_reason: 'user_deferred',
        flawed_draft_forbidden: true,
      }),
    }),
    cooldownHours,
  };
}

/**
 * Handle reminder card CTA.
 */
export function handleProactiveReminderCta(input: {
  cta: ProactiveReminderCtaId;
  draft: ProactiveChangeDraftV1 | null;
  whyZh?: string;
}): ProactiveCtaResultV1 {
  if (input.cta === 'WHY') {
    return {
      action: 'WHY',
      whyZh: input.whyZh ?? input.draft?.whyZh ?? '暂无更多解释',
      draft: input.draft,
    };
  }

  if (!input.draft) {
    throw new ProactiveDraftLifecycleError(
      'NO_DRAFT',
      'VIEW_OPTIONS / DEFER require an existing Change Draft',
    );
  }

  if (input.cta === 'DEFER') {
    const deferred = deferProactiveChangeDraft(input.draft);
    return {
      action: 'DEFER',
      draft: deferred.draft,
      cooldownHours: deferred.cooldownHours,
    };
  }

  // VIEW_OPTIONS
  const previewed = openProactiveDraftPreview(input.draft);
  return {
    action: 'VIEW_OPTIONS',
    draft: previewed,
    preview: previewed.changeDraftCard,
  };
}

/** F7/F8 invariants */
export function assertProactiveDraftConfirmApplyInvariants(
  draft: ProactiveChangeDraftV1,
): void {
  if (draft.status === 'OPEN' && draft.applyAllowed) {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'OPEN draft must not allow apply',
    );
  }
  if (draft.status === 'WAIT_CONFIRM' && draft.applyAllowed) {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'WAIT_CONFIRM draft must not allow apply',
    );
  }
  if (draft.status === 'CONFIRMED' && !draft.applyAllowed) {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'CONFIRMED draft must allow apply',
    );
  }
  if (draft.changeDraftCard.kind !== 'change_draft') {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'Projected card must be change_draft',
    );
  }
  if (draft.applyAuthority !== 'RFC001_FINALIZE') {
    throw new ProactiveDraftLifecycleError(
      'INVALID_STATUS',
      'Apply authority must be RFC001_FINALIZE',
    );
  }
}
