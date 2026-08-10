/**
 * NARA Look · S5 Result / Evidence / Preview entry (iOS reference models)
 *
 * Four-layer result card · evidence sheet · Preview deep-link only (no Apply).
 */

import type {
  NaraLookAction,
  NaraLookAssessment,
  NaraLookAssessmentStatus,
  NaraLookTripRole,
} from './frontend-nara-look-api.types';
import {
  ASSESSMENT_CTA,
  canConfirmApply,
  type DriverApplyGateInput,
} from '../cta-and-roles';

/** Mirror of LookDecisionProblem for client GET …/decision-problem */
export type NaraLookPreviewCorridor =
  | 'DECISION'
  | 'REPAIR'
  | 'ARRANGE_UWC'
  | 'NAVIGATION'
  | 'UNSUPPORTED';

export interface NaraLookDecisionProblem {
  problemId: string;
  tripId: string;
  observationId: string;
  assessmentId: string;
  assessmentRevision: number;
  type: string;
  semanticKey: string;
  title: string;
  description: string;
  status: 'OPEN' | 'WAITING_DECISION' | 'DISMISSED' | 'RESOLVED';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedBy: 'USER';
  detectedAt: string;
  assessmentStatus: NaraLookAssessmentStatus;
  verificationStatus: string;
  evidenceIds: string[];
  preview: {
    corridor: NaraLookPreviewCorridor;
    previewRef: string;
    label: string;
  };
  constraintBridgeKey?: string;
  writesPlanVersion: false;
}

/** Parsed Preview / Navigation entry — never an Apply command */
export type NaraLookPreviewEntry =
  | {
      kind: 'DECISION';
      problemId: string;
      previewRef: string;
      label: string;
      /** Deep link hint for iOS Decision Space */
      routeHint: 'decision_detail';
    }
  | {
      kind: 'REPAIR';
      repairKey: string;
      previewRef: string;
      label: string;
      routeHint: 'repair_preview';
    }
  | {
      kind: 'ARRANGE_UWC';
      arrangeKey: string;
      previewRef: string;
      label: string;
      routeHint: 'arrange_preview';
    }
  | {
      kind: 'NAVIGATION';
      routeKey: string;
      previewRef: string;
      label: string;
      routeHint: 'navigation';
    }
  | {
      kind: 'UNSUPPORTED';
      previewRef: string;
      label: string;
      routeHint: 'unsupported_sheet';
      messageZh: string;
      messageEn: string;
    };

export interface NaraLookResultLayerCopy {
  status: NaraLookAssessmentStatus;
  statusLabel: string;
  whatHappened: string;
  impact: string;
  recommendation: string;
}

export interface NaraLookResultCtaButton {
  role: 'primary' | 'secondary';
  label: string;
  /** Client action — never APPLY */
  action:
    | { type: 'DISMISS' }
    | { type: 'OPEN_EVIDENCE' }
    | { type: 'OPEN_PREVIEW'; entry: NaraLookPreviewEntry }
    | { type: 'OPEN_NAVIGATION'; entry: Extract<NaraLookPreviewEntry, { kind: 'NAVIGATION' }> }
    | { type: 'RECAPTURE'; captureInstruction?: string }
    | { type: 'ENABLE_LOCATION' }
    | { type: 'DELETE_OBSERVATION' }
    | { type: 'UNSUPPORTED'; entry: Extract<NaraLookPreviewEntry, { kind: 'UNSUPPORTED' }> };
}

export interface NaraLookEvidenceSheetItem {
  evidenceId: string;
  kind: 'VISUAL' | 'GROUNDING' | 'OFFICIAL' | 'CONFLICT' | 'UNKNOWN';
  title: string;
  detail: string;
}

export interface NaraLookEvidenceSheet {
  title: string;
  subtitle: string;
  items: NaraLookEvidenceSheetItem[];
  verificationStatus: string;
  dataFreshness?: NaraLookAssessment['dataFreshness'];
  /** Formal road/vehicle conclusions require ≥1 evidenceId */
  formalConclusionAllowed: boolean;
}

export interface NaraLookResultViewModel {
  observationId: string;
  assessmentId: string;
  assessmentRevision: number;
  channel: 'LOOK_FIELD';
  layers: NaraLookResultLayerCopy;
  cta: {
    primary: NaraLookResultCtaButton;
    secondary: NaraLookResultCtaButton;
  };
  evidenceSheet: NaraLookEvidenceSheet;
  /** Present when trip-impacting; Preview only */
  linkedDecisionProblemId?: string;
  previewEntry?: NaraLookPreviewEntry;
  writesPlanVersion: false;
  /** True when Member/Advisor — Confirm Apply must stay disabled outside Look */
  confirmApplyAllowed: boolean;
  /** Forbidden copy must never appear for EXECUTION_BLOCK */
  forbiddenSecondaryLabels: string[];
}

const STATUS_LABEL_ZH: Record<NaraLookAssessmentStatus, string> = {
  INFO: '信息',
  NOTICE: '提醒',
  NEED_CONFIRM: '需确认',
  SUGGEST_REPLACE: '建议调整',
  EXECUTION_BLOCK: '执行阻断',
  UNKNOWN: '无法确定',
};

const STATUS_LABEL_EN: Record<NaraLookAssessmentStatus, string> = {
  INFO: 'Info',
  NOTICE: 'Notice',
  NEED_CONFIRM: 'Needs confirm',
  SUGGEST_REPLACE: 'Suggest change',
  EXECUTION_BLOCK: 'Execution block',
  UNKNOWN: 'Unknown',
};

const FORBIDDEN_BLOCK_SECONDARY = [
  '继续',
  '忽略',
  '仍然前往',
  '强制执行',
  'Keep current plan',
  'Continue',
  'Ignore',
  'Proceed anyway',
];

export function parsePreviewRef(
  previewRef: string,
  label: string,
): NaraLookPreviewEntry {
  if (previewRef.startsWith('decision:')) {
    const problemId = previewRef.slice('decision:'.length);
    return {
      kind: 'DECISION',
      problemId,
      previewRef,
      label,
      routeHint: 'decision_detail',
    };
  }
  if (previewRef.startsWith('repair:')) {
    return {
      kind: 'REPAIR',
      repairKey: previewRef.slice('repair:'.length),
      previewRef,
      label,
      routeHint: 'repair_preview',
    };
  }
  if (previewRef.startsWith('arrange:')) {
    return {
      kind: 'ARRANGE_UWC',
      arrangeKey: previewRef.slice('arrange:'.length),
      previewRef,
      label,
      routeHint: 'arrange_preview',
    };
  }
  if (previewRef.startsWith('navigation:')) {
    return {
      kind: 'NAVIGATION',
      routeKey: previewRef.slice('navigation:'.length),
      previewRef,
      label,
      routeHint: 'navigation',
    };
  }
  return {
    kind: 'UNSUPPORTED',
    previewRef,
    label,
    routeHint: 'unsupported_sheet',
    messageZh: '当前无法在现有 Preview 通道中打开此建议。请稍后重试或联系组织者。',
    messageEn:
      'This suggestion cannot open an existing Preview corridor. Try later or ask the organizer.',
  };
}

export function previewEntryFromAction(
  action: NaraLookAction,
): NaraLookPreviewEntry | undefined {
  if (action.type === 'PREVIEW') {
    return parsePreviewRef(action.previewRef, action.label);
  }
  if (action.type === 'NAVIGATION') {
    return parsePreviewRef(action.routeRef, action.label);
  }
  return undefined;
}

export function buildEvidenceSheet(
  assessment: NaraLookAssessment,
  locale: 'zh' | 'en' = 'zh',
): NaraLookEvidenceSheet {
  const conflicting = assessment.verificationStatus === 'CONFLICTING';
  const items: NaraLookEvidenceSheetItem[] = assessment.evidenceIds.map(
    (evidenceId, i) => {
      if (conflicting && i === assessment.evidenceIds.length - 1) {
        return {
          evidenceId,
          kind: 'CONFLICT',
          title: locale === 'zh' ? '冲突证据' : 'Conflicting evidence',
          detail:
            locale === 'zh'
              ? '图像与行程/官方状态不一致，不可据此断言可继续进入。'
              : 'Image conflicts with trip/official state; do not assert safe entry.',
        };
      }
      if (i === 0) {
        return {
          evidenceId,
          kind: 'VISUAL',
          title: locale === 'zh' ? '现场识别' : 'Visual observation',
          detail: assessment.summary.whatHappened,
        };
      }
      return {
        evidenceId,
        kind: 'OFFICIAL',
        title: locale === 'zh' ? '官方/行程对照' : 'Official / trip check',
        detail: assessment.summary.impact,
      };
    },
  );

  if (items.length === 0) {
    items.push({
      evidenceId: 'none',
      kind: 'UNKNOWN',
      title: locale === 'zh' ? '暂无结构化证据' : 'No structured evidence',
      detail:
        locale === 'zh'
          ? '可查看图片说明或补拍后重试。'
          : 'View photo explanation or recapture.',
    });
  }

  return {
    title: locale === 'zh' ? '识别依据' : 'Evidence',
    subtitle:
      locale === 'zh'
        ? `校验：${assessment.verificationStatus}`
        : `Verification: ${assessment.verificationStatus}`,
    items,
    verificationStatus: assessment.verificationStatus,
    dataFreshness: assessment.dataFreshness,
    formalConclusionAllowed: assessment.evidenceIds.length >= 1,
  };
}

function resolveCtaVariant(
  assessment: NaraLookAssessment,
):
  | NaraLookAssessmentStatus
  | 'NO_GPS'
  | 'CONFLICTING'
  | 'RETRY' {
  if (assessment.verificationStatus === 'CONFLICTING') return 'CONFLICTING';
  if (
    assessment.status === 'INFO' &&
    (assessment.decisionProblem?.semanticKey ===
      'DATA_UNCERTAINTY.GPS_INSUFFICIENT' ||
      assessment.decisionProblem?.semanticKey?.includes('GPS'))
  ) {
    return 'NO_GPS';
  }
  return assessment.status;
}

function buttonForPrimary(
  assessment: NaraLookAssessment,
  label: string,
  previewEntry: NaraLookPreviewEntry | undefined,
  variant: ReturnType<typeof resolveCtaVariant>,
): NaraLookResultCtaButton {
  if (variant === 'NO_GPS') {
    return { role: 'primary', label, action: { type: 'ENABLE_LOCATION' } };
  }
  if (variant === 'RETRY' || assessment.status === 'UNKNOWN') {
    const recapture = assessment.actions.find((a) => a.type === 'RECAPTURE');
    return {
      role: 'primary',
      label,
      action: {
        type: 'RECAPTURE',
        captureInstruction:
          recapture?.type === 'RECAPTURE'
            ? recapture.captureInstruction
            : undefined,
      },
    };
  }
  if (previewEntry?.kind === 'UNSUPPORTED') {
    return {
      role: 'primary',
      label,
      action: { type: 'UNSUPPORTED', entry: previewEntry },
    };
  }
  if (previewEntry?.kind === 'NAVIGATION') {
    return {
      role: 'primary',
      label,
      action: { type: 'OPEN_NAVIGATION', entry: previewEntry },
    };
  }
  if (previewEntry) {
    return {
      role: 'primary',
      label,
      action: { type: 'OPEN_PREVIEW', entry: previewEntry },
    };
  }
  if (
    assessment.status === 'INFO' ||
    assessment.status === 'NOTICE' ||
    assessment.status === 'NEED_CONFIRM'
  ) {
    // Secondary often opens evidence; primary dismiss when no preview
    if (assessment.status === 'INFO') {
      return { role: 'primary', label, action: { type: 'DISMISS' } };
    }
    if (assessment.status === 'NOTICE') {
      return { role: 'primary', label, action: { type: 'DISMISS' } };
    }
  }
  return { role: 'primary', label, action: { type: 'OPEN_EVIDENCE' } };
}

function buttonForSecondary(
  assessment: NaraLookAssessment,
  label: string,
  variant: ReturnType<typeof resolveCtaVariant>,
): NaraLookResultCtaButton {
  if (variant === 'NO_GPS') {
    return { role: 'secondary', label, action: { type: 'OPEN_EVIDENCE' } };
  }
  if (variant === 'RETRY') {
    return {
      role: 'secondary',
      label,
      action: { type: 'DELETE_OBSERVATION' },
    };
  }
  if (assessment.status === 'UNKNOWN' || variant === 'CONFLICTING') {
    return { role: 'secondary', label, action: { type: 'OPEN_EVIDENCE' } };
  }
  if (assessment.status === 'SUGGEST_REPLACE') {
    // Keep current plan = dismiss suggestion only (not Apply / not bypass Gate)
    return { role: 'secondary', label, action: { type: 'DISMISS' } };
  }
  if (assessment.status === 'EXECUTION_BLOCK') {
    return { role: 'secondary', label, action: { type: 'OPEN_EVIDENCE' } };
  }
  if (assessment.status === 'INFO' || assessment.status === 'NOTICE') {
    return { role: 'secondary', label, action: { type: 'OPEN_EVIDENCE' } };
  }
  return { role: 'secondary', label, action: { type: 'DISMISS' } };
}

/**
 * Build RESULT screen view-model from assessment (+ optional linked problem).
 * Confirm Apply is never offered inside Look; `confirmApplyAllowed` is for
 * the external Preview/Confirm surface only.
 */
export function buildResultViewModel(input: {
  assessment: NaraLookAssessment;
  problem?: NaraLookDecisionProblem;
  locale?: 'zh' | 'en';
  role?: NaraLookTripRole;
  applyGate?: Omit<DriverApplyGateInput, 'role'>;
}): NaraLookResultViewModel {
  const locale = input.locale ?? 'zh';
  const assessment = input.assessment;
  if (assessment.writesPlanVersion !== false) {
    throw new Error('invariant: writesPlanVersion must be false');
  }

  const variant = resolveCtaVariant(assessment);
  const ctaPair =
    variant === 'NO_GPS' || variant === 'CONFLICTING' || variant === 'RETRY'
      ? ASSESSMENT_CTA[variant][locale]
      : ASSESSMENT_CTA[assessment.status][locale];

  const previewAction = assessment.actions.find(
    (a) => a.type === 'PREVIEW' || a.type === 'NAVIGATION',
  );
  let previewEntry = previewAction
    ? previewEntryFromAction(previewAction)
    : undefined;

  if (input.problem) {
    previewEntry = parsePreviewRef(
      input.problem.preview.previewRef,
      input.problem.preview.label,
    );
  }

  const role = input.role ?? 'MEMBER';
  const confirmApplyAllowed = canConfirmApply({
    role,
    canConfirmExecutionChange: input.applyGate?.canConfirmExecutionChange ?? false,
    isActivelyDriving: input.applyGate?.isActivelyDriving ?? false,
    proposalBlocked: input.applyGate?.proposalBlocked ?? false,
    previewConfirmsWriteAuthority:
      input.applyGate?.previewConfirmsWriteAuthority ?? false,
  });

  const primaryLabel =
    previewEntry &&
    (assessment.status === 'EXECUTION_BLOCK' ||
      assessment.status === 'SUGGEST_REPLACE' ||
      assessment.status === 'NEED_CONFIRM' ||
      variant === 'CONFLICTING')
      ? previewEntry.label || ctaPair.primary
      : ctaPair.primary;

  return {
    observationId: assessment.observationId,
    assessmentId: assessment.assessmentId,
    assessmentRevision: assessment.assessmentRevision,
    channel: 'LOOK_FIELD',
    layers: {
      status: assessment.status,
      statusLabel:
        locale === 'zh'
          ? STATUS_LABEL_ZH[assessment.status]
          : STATUS_LABEL_EN[assessment.status],
      whatHappened: assessment.summary.whatHappened,
      impact: assessment.summary.impact,
      recommendation: assessment.summary.recommendation,
    },
    cta: {
      primary: buttonForPrimary(
        assessment,
        primaryLabel,
        previewEntry,
        variant,
      ),
      secondary: buttonForSecondary(assessment, ctaPair.secondary, variant),
    },
    evidenceSheet: buildEvidenceSheet(assessment, locale),
    linkedDecisionProblemId:
      assessment.decisionProblem?.linkedDecisionProblemId ??
      input.problem?.problemId,
    previewEntry,
    writesPlanVersion: false,
    confirmApplyAllowed,
    forbiddenSecondaryLabels:
      assessment.status === 'EXECUTION_BLOCK' ? [...FORBIDDEN_BLOCK_SECONDARY] : [],
  };
}

/** Guard for RESULT UI — EXECUTION_BLOCK secondary must not use forbidden copy */
export function assertResultCtaSafe(vm: NaraLookResultViewModel): void {
  if (vm.layers.status !== 'EXECUTION_BLOCK') return;
  const labels = [vm.cta.primary.label, vm.cta.secondary.label];
  for (const forbidden of vm.forbiddenSecondaryLabels) {
    for (const label of labels) {
      if (label.includes(forbidden)) {
        throw new Error(`forbidden EXECUTION_BLOCK CTA: ${label}`);
      }
    }
  }
  if (vm.cta.primary.action.type === 'DISMISS' && vm.previewEntry) {
    // Allow dismiss only when no preview — with preview must open safe options
  }
}

/** iOS deep-link builder for existing surfaces (no Look Apply) */
export function previewDeepLink(
  entry: NaraLookPreviewEntry,
  tripId: string,
): string {
  switch (entry.kind) {
    case 'DECISION':
      return `tripnara://trips/${encodeURIComponent(tripId)}/decisions/${encodeURIComponent(entry.problemId)}`;
    case 'REPAIR':
      return `tripnara://trips/${encodeURIComponent(tripId)}/repair/${encodeURIComponent(entry.repairKey)}`;
    case 'ARRANGE_UWC':
      return `tripnara://trips/${encodeURIComponent(tripId)}/arrange/preview?key=${encodeURIComponent(entry.arrangeKey)}`;
    case 'NAVIGATION':
      return `tripnara://trips/${encodeURIComponent(tripId)}/navigate/${encodeURIComponent(entry.routeKey)}`;
    case 'UNSUPPORTED':
      return `tripnara://trips/${encodeURIComponent(tripId)}/look/unsupported`;
  }
}
