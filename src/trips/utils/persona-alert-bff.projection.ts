/**
 * Persona Alerts BFF — C 端人话投影
 * @see docs/persona-alerts-bff-contract.md
 */

import type { GuardianPersonaPresentation } from '../decision/shared/guardian-presentation.types';
import type { DecisionLogEntry } from '../decision/shared/decision-result.types';
import type { FeasibilityIssueDto } from '../trip-constraint-solver/types/trip-constraint-solver.types';
import type { ReadinessGuardianNegotiationSnapshot } from '../readiness/types/coverage-map.types';
import {
  AlertSeverity,
  PersonaAlertDeepLinkDto,
  PersonaAlertDto,
  PersonaAlertMetadataDto,
  PersonaType,
  GuardianPresentationSnapshotDto,
} from '../dto/persona-alerts.dto';
import {
  isInternalPersonaAlertReasonCode,
  mapPersonaAlertReasonCodesDisplayZh,
} from './persona-alert-reason-codes.util';
import {
  buildDeepLinkForFeasibilityIssue,
  projectFeasibilityIssueToPersonaAlert,
  projectPersonaAlertsFromFeasibilityIssues,
  resolvePersonaFromFeasibilityIssue,
  resolveScenarioFromFeasibilityIssue,
  toGuardianPresentationSnapshot,
} from './guardian-user-facing.projection.util';

export type PersonaAlertAudience = 'user' | 'internal';

export type ProjectPersonaAlertsOptions = {
  audience?: PersonaAlertAudience;
  limit?: number;
  phase?: 'planning' | 'in_trip';
};

const INTERNAL_DEBUG_PATTERNS: RegExp[] = [
  /persona\s+closure/i,
  /\bstop=ABU/i,
  /\brechecks=\d/i,
  /^Abu=/i,
  /\bgate=ALLOW\b/i,
  /\bstep=ABU_FATAL/i,
];

const PERSONA_MARKETING_TITLE =
  /守护者|北极熊|牧羊犬|海獭|🐻|🐕|🦦|Persona Shell/i;

const NO_RISK_KEYWORDS = [
  '未发现',
  '无需',
  '均在可接受范围内',
  '允许继续',
  '无问题',
  '没有问题',
  '未发现问题',
];

const INTERNAL_PIPELINE_STEPS = new Set(['OPTIMIZE', 'POI_SELECTION']);

function truncate(text: string, maxLen: number): string {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function isInternalDebugPersonaText(text: string | undefined): boolean {
  const t = String(text ?? '').trim();
  if (!t) return true;
  return INTERNAL_DEBUG_PATTERNS.some((re) => re.test(t));
}

export function isPersonaMarketingTitle(title: string | undefined): boolean {
  return PERSONA_MARKETING_TITLE.test(String(title ?? ''));
}

function sanitizeUserFacingExplanation(raw: string | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t || isInternalDebugPersonaText(t)) return '';
  return truncate(t, 500);
}

function isNoRiskDecisionLog(log: DecisionLogEntry): boolean {
  if (log.action !== 'ALLOW') return false;
  const explanation = log.explanation || '';
  return NO_RISK_KEYWORDS.some((kw) => explanation.includes(kw));
}

function shouldOmitDecisionLogForUser(log: DecisionLogEntry): boolean {
  const codes = log.reasonCodes ?? [];
  if (codes.some((c) => isInternalPersonaAlertReasonCode(String(c)))) return true;

  const rr = log.metadata?.route_and_run as { step?: string } | undefined;
  const step = typeof rr?.step === 'string' ? rr.step.trim() : '';
  if (step && INTERNAL_PIPELINE_STEPS.has(step)) return true;
  if (codes.some((c) => INTERNAL_PIPELINE_STEPS.has(String(c).trim()))) return true;

  if (log.persona === 'USER_ACTION') return true;
  if (isNoRiskDecisionLog(log)) return true;

  return false;
}

function mapActionToSeverity(
  action: DecisionLogEntry['action'],
  audience: PersonaAlertAudience,
): AlertSeverity | null {
  if (action === 'REJECT') return AlertSeverity.WARNING;
  if (action === 'ADJUST' || action === 'REPLACE') return AlertSeverity.INFO;
  if (action === 'ALLOW') {
    return audience === 'internal' ? AlertSeverity.SUCCESS : null;
  }
  return AlertSeverity.INFO;
}

function extractPresentationFromLog(
  log: DecisionLogEntry,
): GuardianPersonaPresentation | undefined {
  const meta = log.metadata ?? {};
  const pres = meta.guardianPresentation ?? meta.guardian_presentation;
  if (pres && typeof pres === 'object' && 'headline' in (pres as object)) {
    return pres as GuardianPersonaPresentation;
  }
  return undefined;
}

function buildMetadata(params: {
  audience: PersonaAlertAudience;
  reasonCodes: string[];
  reasonCodesDisplayZh: string[];
  scenario?: string;
  action?: string;
  decisionSource?: string;
  readinessEvidenceDisplayZh?: string;
  deepLink?: PersonaAlertDeepLinkDto;
  issueId?: string;
  expressionPhase?: 'planning' | 'in_trip';
}): PersonaAlertMetadataDto {
  return {
    audience: params.audience,
    scenario: params.scenario,
    action: params.action as PersonaAlertMetadataDto['action'],
    decisionSource: params.decisionSource as PersonaAlertMetadataDto['decisionSource'],
    reasonCodes: params.reasonCodes,
    reasonCodesDisplayZh: params.reasonCodesDisplayZh,
    readinessEvidenceDisplayZh: params.readinessEvidenceDisplayZh,
    deepLink: params.deepLink,
    issueId: params.issueId,
    expressionPhase: params.expressionPhase,
  };
}

function resolveDeepLinkForDecisionLog(
  log: DecisionLogEntry,
  presentation?: GuardianPersonaPresentation,
): PersonaAlertDeepLinkDto {
  const issueId =
    typeof log.metadata?.issueId === 'string'
      ? log.metadata.issueId
      : typeof log.metadata?.feasibility_issue_id === 'string'
        ? log.metadata.feasibility_issue_id
        : undefined;
  const dayIndex =
    typeof log.metadata?.dayIndex === 'number'
      ? log.metadata.dayIndex
      : typeof log.metadata?.day_index === 'number'
        ? log.metadata.day_index
        : undefined;

  if (issueId) {
    return { type: 'feasibility', issueId, ...(dayIndex ? { dayIndex } : {}) };
  }
  if (dayIndex != null) {
    return { type: 'schedule_day', dayIndex };
  }
  if (presentation?.scenario === 'SAFETY_BLOCK' || log.action === 'REJECT') {
    return { type: 'feasibility' };
  }
  return {
    type: 'decision_log',
    decisionLogId: `${log.timestamp}-${log.persona}`,
  };
}

function projectFromDecisionLog(
  log: DecisionLogEntry,
  audience: PersonaAlertAudience,
): PersonaAlertDto | null {
  if (audience === 'user' && shouldOmitDecisionLogForUser(log)) return null;

  const presentationRaw = extractPresentationFromLog(log);
  const presentation = presentationRaw
    ? toGuardianPresentationSnapshot(presentationRaw)
    : undefined;
  const readinessLines = Array.isArray(log.metadata?.readiness_evidence_display_zh)
    ? (log.metadata!.readiness_evidence_display_zh as string[])
    : [];
  const readinessEvidenceDisplayZh = readinessLines.filter(Boolean).join('；') || undefined;

  const { displayZh: reasonCodesDisplayZh, templateExplanation } =
    mapPersonaAlertReasonCodesDisplayZh(log.reasonCodes);

  let explanation =
    sanitizeUserFacingExplanation(presentation?.narrative) ||
    sanitizeUserFacingExplanation(presentation?.briefLines?.[0]) ||
    sanitizeUserFacingExplanation(readinessEvidenceDisplayZh) ||
    sanitizeUserFacingExplanation(log.explanation) ||
    sanitizeUserFacingExplanation(templateExplanation);

  if (!explanation) return null;

  const titleRaw =
    presentation?.headline ||
    (reasonCodesDisplayZh.length ? reasonCodesDisplayZh[0] : undefined) ||
    log.explanation;
  let title = isPersonaMarketingTitle(titleRaw)
    ? reasonCodesDisplayZh[0] ?? '行程需要调整'
    : truncate(String(titleRaw ?? ''), 40);
  if (!title || isInternalDebugPersonaText(title)) {
    title = reasonCodesDisplayZh[0] ?? '行程需要调整';
  }

  const severity = mapActionToSeverity(log.action, audience);
  if (!severity) return null;

  const persona = (
    presentation?.leadSpeaker ??
    (log.persona === 'USER_ACTION' ? null : log.persona)
  ) as PersonaType | null;
  if (!persona || persona === PersonaType.USER_ACTION) return null;

  const scenario =
    presentation?.scenario ??
    (typeof log.metadata?.guardianScenario === 'string'
      ? log.metadata.guardianScenario
      : undefined);

  const deepLink = resolveDeepLinkForDecisionLog(log, presentationRaw);

  return {
    id: `alert-log-${log.timestamp}-${persona}`,
    persona,
    severity,
    title,
    explanation,
    message: audience === 'internal' ? log.explanation : undefined,
    name: persona,
    createdAt: log.timestamp,
    presentation,
    metadata: buildMetadata({
      audience,
      reasonCodes: (log.reasonCodes ?? []).filter(
        (c) => !isInternalPersonaAlertReasonCode(String(c)),
      ),
      reasonCodesDisplayZh,
      scenario,
      action: log.action,
      decisionSource: log.decisionSource,
      readinessEvidenceDisplayZh,
      deepLink,
      expressionPhase: presentation?.expressionPhase,
    }),
  };
}

function projectFromGuardianPresentation(
  presentation: GuardianPersonaPresentation,
  audience: PersonaAlertAudience,
): PersonaAlertDto | null {
  if (presentation.scenario === 'ALL_CLEAR') return null;

  const snapshot = toGuardianPresentationSnapshot(presentation);
  const explanation =
    sanitizeUserFacingExplanation(snapshot.narrative) ||
    sanitizeUserFacingExplanation(snapshot.briefLines?.[0]);
  if (!explanation) return null;

  const title = isPersonaMarketingTitle(snapshot.headline)
    ? truncate(explanation, 40)
    : truncate(snapshot.headline ?? explanation, 40);

  const abuAction = snapshot.actions?.abu;
  const severity =
    abuAction === 'BLOCK' || snapshot.scenario === 'SAFETY_BLOCK'
      ? AlertSeverity.WARNING
      : AlertSeverity.INFO;

  const reasonCodes =
    snapshot.scenario === 'SAFETY_BLOCK'
      ? ['ABU_FATAL_REJECT']
      : snapshot.scenario === 'PACE_COST'
        ? ['PACE_OVERLOAD']
        : snapshot.scenario === 'INTENT_REPAIR'
          ? ['INTENT_REPAIR']
          : [];
  const { displayZh: reasonCodesDisplayZh } = mapPersonaAlertReasonCodesDisplayZh(reasonCodes);

  return {
    id: `alert-presentation-${presentation.leadSpeaker}-${presentation.scenario}`,
    persona: presentation.leadSpeaker as PersonaType,
    severity,
    title,
    explanation,
    createdAt: new Date().toISOString(),
    presentation: snapshot,
    metadata: buildMetadata({
      audience,
      reasonCodes,
      reasonCodesDisplayZh:
        reasonCodesDisplayZh.length > 0 ? reasonCodesDisplayZh : [title],
      scenario: snapshot.scenario,
      action:
        abuAction === 'BLOCK'
          ? 'REJECT'
          : abuAction === 'ADJUST'
            ? 'ADJUST'
            : 'REPLACE',
      deepLink: { type: 'feasibility' },
      expressionPhase: snapshot.expressionPhase,
    }),
  };
}

function dedupePersonaAlerts(alerts: PersonaAlertDto[]): PersonaAlertDto[] {
  const severityRank: Record<AlertSeverity, number> = {
    [AlertSeverity.WARNING]: 3,
    [AlertSeverity.INFO]: 2,
    [AlertSeverity.SUCCESS]: 1,
  };

  const byKey = new Map<string, PersonaAlertDto>();
  for (const alert of alerts) {
    const issueId = alert.metadata?.issueId ?? alert.metadata?.deepLink?.issueId ?? '';
    const key = `${alert.persona}::${alert.metadata?.scenario ?? ''}::${issueId}`;
    const existing = byKey.get(key);
    if (!existing || severityRank[alert.severity] > severityRank[existing.severity]) {
      byKey.set(key, alert);
    }
  }
  return [...byKey.values()];
}

function filterByPhase(
  alerts: PersonaAlertDto[],
  phase?: 'planning' | 'in_trip',
): PersonaAlertDto[] {
  if (!phase) return alerts;
  return alerts.filter((a) => {
    const p = a.presentation?.expressionPhase ?? a.metadata?.expressionPhase;
    return !p || p === phase;
  });
}

const PERSONA_PRIORITY: Record<PersonaType, number> = {
  [PersonaType.ABU]: 3,
  [PersonaType.DR_DRE]: 2,
  [PersonaType.NEPTUNE]: 1,
  [PersonaType.USER_ACTION]: 0,
};

export function projectPersonaAlertsForAudience(input: {
  decisionLogs: DecisionLogEntry[];
  feasibilityIssues?: FeasibilityIssueDto[];
  guardianPresentation?: GuardianPersonaPresentation;
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  options?: ProjectPersonaAlertsOptions;
}): PersonaAlertDto[] {
  const audience = input.options?.audience ?? 'user';
  const limit = input.options?.limit ?? 20;

  const fromLogs = input.decisionLogs
    .map((log) => projectFromDecisionLog(log, audience))
    .filter((a): a is PersonaAlertDto => a != null);

  const fromIssues = projectPersonaAlertsFromFeasibilityIssues(
    input.feasibilityIssues ?? [],
    {
      audience,
      guardianNegotiation: input.guardianNegotiation,
    },
  );

  const fromPresentation = input.guardianPresentation
    ? [projectFromGuardianPresentation(input.guardianPresentation, audience)].filter(
        (a): a is PersonaAlertDto => a != null,
      )
    : [];

  let merged = dedupePersonaAlerts([...fromPresentation, ...fromIssues, ...fromLogs]);
  merged = filterByPhase(merged, input.options?.phase);

  if (audience === 'user') {
    merged = merged.filter(
      (a) =>
        a.metadata?.audience === 'user' &&
        a.severity !== AlertSeverity.SUCCESS &&
        a.persona !== PersonaType.USER_ACTION &&
        Boolean(a.explanation?.trim()) &&
        Boolean(a.metadata?.deepLink),
    );
  }

  merged.sort((a, b) => {
    const sev =
      (b.severity === AlertSeverity.WARNING ? 1 : 0) -
      (a.severity === AlertSeverity.WARNING ? 1 : 0);
    if (sev !== 0) return sev;
    const persona =
      (PERSONA_PRIORITY[b.persona] ?? 0) - (PERSONA_PRIORITY[a.persona] ?? 0);
    if (persona !== 0) return persona;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return merged.slice(0, limit);
}

/** 供 readiness-repair loop / 可执行证明侧栏复用 */
export {
  projectFeasibilityIssueToPersonaAlert,
  buildDeepLinkForFeasibilityIssue,
  resolvePersonaFromFeasibilityIssue,
  resolveScenarioFromFeasibilityIssue,
};
