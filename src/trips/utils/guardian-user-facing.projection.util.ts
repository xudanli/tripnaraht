/**
 * Guardian / 准备度 / 可执行证明 — C 端人话投影 SSOT（M2/M3）
 * 供 persona-alerts BFF、readiness-repair loop UI、Decision Strip 同源消费。
 */

import type { GuardianPersonaPresentation } from '../decision/shared/guardian-presentation.types';
import type { FeasibilityIssueDto } from '../trip-constraint-solver/types/trip-constraint-solver.types';
import type { ReadinessGuardianNegotiationSnapshot } from '../readiness/types/coverage-map.types';
import {
  buildPresentationFromReadinessNegotiationSummary,
  pickGuardianSummaryForBlocker,
} from '../readiness/utils/readiness-guardian-negotiation.util';
import {
  AlertSeverity,
  GuardianPresentationSnapshotDto,
  PersonaAlertDeepLinkDto,
  PersonaAlertDto,
  PersonaType,
} from '../dto/persona-alerts.dto';
import { mapPersonaAlertReasonCodesDisplayZh } from './persona-alert-reason-codes.util';
import {
  buildFeasibilityIssueUserExplanation,
  buildFeasibilityIssueEvidenceLines,
  isLowQualityUserFacingText,
} from '../trip-constraint-solver/utils/feasibility-issue-user-copy.util';
import { projectIssueTradeoffDimensionsForPersonaAlert } from '../decision-semantics/projections/tradeoff-contextual-narrative.util';

export type GuardianUserFacingAudience = 'user' | 'internal';

function truncate(text: string, maxLen: number): string {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function toGuardianPresentationSnapshot(
  presentation: GuardianPersonaPresentation,
): GuardianPresentationSnapshotDto {
  return {
    headline: presentation.headline,
    narrative: presentation.narrative,
    briefLines: presentation.briefLines,
    leadSpeaker: presentation.leadSpeaker,
    scenario: presentation.scenario,
    displayStyle: presentation.displayStyle,
    expressionPhase: presentation.expressionPhase,
    actions: presentation.actions as GuardianPresentationSnapshotDto['actions'],
    supportingLines: presentation.supportingLines?.map((line) => ({
      persona: line.persona,
      role: line.role,
      text: line.text,
    })),
    hardConstraintBlocked: presentation.hardConstraintBlocked,
  };
}

export function resolvePersonaFromFeasibilityIssue(issue: FeasibilityIssueDto): PersonaType {
  const cat = String(issue.category ?? '').toLowerCase();
  if (cat === 'schedule' || cat === 'team_fit') return PersonaType.DR_DRE;
  if (cat === 'environment' || cat === 'access_capacity' || cat === 'transport') {
    return PersonaType.ABU;
  }
  if (issue.issueKind?.includes('repair') || issue.issueKind?.includes('spatial')) {
    return PersonaType.NEPTUNE;
  }
  return PersonaType.DR_DRE;
}

export function resolveScenarioFromFeasibilityIssue(
  issue: FeasibilityIssueDto,
): GuardianPresentationSnapshotDto['scenario'] {
  const persona = resolvePersonaFromFeasibilityIssue(issue);
  if (persona === PersonaType.ABU) {
    return issue.priority === 'must_handle' ? 'SAFETY_BLOCK' : 'SAFETY_WARN';
  }
  if (persona === PersonaType.NEPTUNE) return 'INTENT_REPAIR';
  return 'PACE_COST';
}

export function reasonCodesFromFeasibilityIssue(issue: FeasibilityIssueDto): string[] {
  const kind = String(issue.issueKind ?? '').trim();
  if (kind.includes('buffer')) return ['BUFFER_INSUFFICIENT'];
  if (kind.includes('coverage') || (issue.message ?? '').includes('缺少证据覆盖')) {
    return ['COVERAGE_GAP'];
  }
  if (kind.includes('pace') || issue.category === 'schedule') return ['PACE_OVERLOAD'];
  if (kind.includes('closure') || issue.category === 'access_capacity') return ['CLOSURE_RISK'];
  if (kind.includes('wind') || issue.category === 'environment') return ['HIGH_WIND_DRIVING'];
  if (issue.priority === 'must_handle') return ['ABU_FATAL_REJECT'];
  return ['INTENT_REPAIR'];
}

export function buildDeepLinkForFeasibilityIssue(
  issue: FeasibilityIssueDto,
): PersonaAlertDeepLinkDto {
  const hints = issue.uiHints?.deepLink;
  if (hints && typeof hints === 'object' && !Array.isArray(hints)) {
    const dayIndex =
      typeof hints.dayIndex === 'number' && hints.dayIndex >= 1
        ? hints.dayIndex
        : issue.affectedDays?.[0];
    if (dayIndex != null) {
      return { type: 'schedule_day', issueId: issue.id, dayIndex };
    }
  }

  if (issue.priority === 'must_handle' && issue.category === 'booking') {
    return { type: 'plan_gate', issueId: issue.id };
  }

  const dayIndex = issue.affectedDays?.[0];
  if (dayIndex != null) {
    return { type: 'decision_checker', issueId: issue.id, dayIndex };
  }

  return { type: 'decision_checker', issueId: issue.id };
}

function resolveGuardianActionForIssue(
  issue: FeasibilityIssueDto,
  persona: PersonaType,
): 'BLOCK' | 'ADJUST' | 'REPAIR' | 'CHOOSE' | undefined {
  if (issue.priority === 'must_handle') {
    return persona === PersonaType.ABU ? 'BLOCK' : 'ADJUST';
  }
  if (persona === PersonaType.NEPTUNE) return 'REPAIR';
  return 'ADJUST';
}

export function buildMinimalPresentationFromFeasibilityIssue(
  issue: FeasibilityIssueDto,
): GuardianPresentationSnapshotDto {
  const persona = resolvePersonaFromFeasibilityIssue(issue);
  const scenario = resolveScenarioFromFeasibilityIssue(issue);
  const action = resolveGuardianActionForIssue(issue, persona);
  const actions: GuardianPresentationSnapshotDto['actions'] = {};
  if (persona === PersonaType.ABU && action) actions.abu = action;
  if (persona === PersonaType.DR_DRE && action) actions.dre = action;
  if (persona === PersonaType.NEPTUNE && action) actions.neptune = action;

  return {
    headline: truncate(issue.title, 80),
    narrative: truncate(buildFeasibilityIssueUserExplanation(issue), 500),
    leadSpeaker: persona as GuardianPresentationSnapshotDto['leadSpeaker'],
    scenario,
    displayStyle: 'design_advisory',
    expressionPhase: 'planning',
    actions,
    hardConstraintBlocked: issue.priority === 'must_handle' && persona === PersonaType.ABU,
  };
}

export function buildPresentationSnapshotForFeasibilityIssue(
  issue: FeasibilityIssueDto,
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot,
): GuardianPresentationSnapshotDto {
  const summary = pickGuardianSummaryForBlocker(guardianNegotiation, issue.id);
  if (summary) {
    return toGuardianPresentationSnapshot(
      buildPresentationFromReadinessNegotiationSummary(summary),
    );
  }
  return buildMinimalPresentationFromFeasibilityIssue(issue);
}

export function mapFeasibilityIssueSeverity(issue: FeasibilityIssueDto): AlertSeverity {
  if (issue.priority === 'must_handle' || issue.severity === 'high') {
    return AlertSeverity.WARNING;
  }
  return AlertSeverity.INFO;
}

export function projectFeasibilityIssueToPersonaAlert(
  issue: FeasibilityIssueDto,
  ctx: {
    audience?: GuardianUserFacingAudience;
    guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
    createdAt?: string;
  } = {},
): PersonaAlertDto | null {
  const audience = ctx.audience ?? 'user';
  if (issue.priority === 'pending_confirm' && audience === 'user') {
    // 待确认项仍可展示为 info
  }

  const title = truncate(String(issue.title ?? '').trim(), 40);
  const explanation = truncate(buildFeasibilityIssueUserExplanation(issue), 500);
  if (!title || !explanation) return null;

  const evidenceLines = buildFeasibilityIssueEvidenceLines(issue);

  const reasonCodes = reasonCodesFromFeasibilityIssue(issue);
  const { displayZh: reasonCodesDisplayZh } = mapPersonaAlertReasonCodesDisplayZh(reasonCodes);
  if (!reasonCodesDisplayZh.length) return null;

  const persona = resolvePersonaFromFeasibilityIssue(issue);
  const presentation = buildPresentationSnapshotForFeasibilityIssue(
    issue,
    ctx.guardianNegotiation,
  );
  const scenario = presentation.scenario ?? resolveScenarioFromFeasibilityIssue(issue);
  const deepLink = buildDeepLinkForFeasibilityIssue(issue);

  const tradeoffDimensions = projectIssueTradeoffDimensionsForPersonaAlert(issue).map((row) => ({
    dimension: row.dimension,
    direction: row.direction,
    explanation: row.explanation,
    contextualNarrative: row.contextualNarrative,
    value: row.value,
    unit: row.unit,
  }));

  return {
    id: `alert-issue-${issue.id}`,
    persona,
    severity: mapFeasibilityIssueSeverity(issue),
    title,
    explanation,
    createdAt: ctx.createdAt ?? new Date().toISOString(),
    presentation,
    metadata: {
      audience,
      scenario,
      action: issue.priority === 'must_handle' ? 'REJECT' : 'ADJUST',
      reasonCodes,
      reasonCodesDisplayZh,
      readinessEvidenceDisplayZh: evidenceLines.length
        ? evidenceLines.join('；')
        : undefined,
      deepLink,
      issueId: issue.id,
      expressionPhase: presentation.expressionPhase,
      tradeoffDimensions,
    },
  };
}

export function projectPersonaAlertsFromFeasibilityIssues(
  issues: FeasibilityIssueDto[],
  ctx: {
    audience?: GuardianUserFacingAudience;
    guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  } = {},
): PersonaAlertDto[] {
  return issues
    .filter((issue) => issue.priority !== 'pending_confirm' || ctx.audience === 'internal')
    .map((issue) => projectFeasibilityIssueToPersonaAlert(issue, ctx))
    .filter((a): a is PersonaAlertDto => a != null);
}

export function pickLatestGuardianPresentationFromLogs(
  logs: Array<{ metadata?: Record<string, unknown> }>,
): GuardianPersonaPresentation | undefined {
  for (const log of logs) {
    const meta = log.metadata ?? {};
    const pres = meta.guardianPresentation ?? meta.guardian_presentation;
    if (pres && typeof pres === 'object' && 'headline' in (pres as object)) {
      return pres as GuardianPersonaPresentation;
    }
  }
  return undefined;
}
