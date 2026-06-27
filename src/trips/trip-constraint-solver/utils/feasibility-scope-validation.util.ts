import type { ReadinessScoreFinding, ReadinessScoreResponse } from '../../readiness/types/coverage-map.types';
import type { FeasibilityScopeDto } from '../dto/feasibility-report.dto';
import type {
  FeasibilityDimensionDto,
  FeasibilityVerdictStatus,
  TripFeasibilityReportDto,
} from '../types/trip-constraint-solver.types';
import { computeCanStartExecute } from './feasibility-assembler.util';
import { computeGateExecute } from '../../../poi-access-capacity/utils/gate-execute.util';

export function filterReadinessByDay(
  readiness: ReadinessScoreResponse,
  dayNumber: number,
): ReadinessScoreResponse {
  const findings = readiness.findings.filter(
    (f) => !f.affectedDays?.length || f.affectedDays.includes(dayNumber),
  );
  return {
    ...readiness,
    findings,
    summary: recalcReadinessSummary(findings, readiness),
  };
}

export function filterReadinessByIssue(
  readiness: ReadinessScoreResponse,
  issueId: string,
): ReadinessScoreResponse {
  const blockerAliases = buildIssueBlockerAliases(issueId);
  const findings = readiness.findings.filter((f) => blockerAliases.has(f.id));
  return {
    ...readiness,
    findings: findings.length > 0 ? findings : readiness.findings,
    summary: recalcReadinessSummary(
      findings.length > 0 ? findings : readiness.findings,
      readiness,
    ),
  };
}

function recalcReadinessSummary(
  findings: ReadinessScoreFinding[],
  base: ReadinessScoreResponse,
): ReadinessScoreResponse['summary'] {
  const blockers = findings.filter((f) => f.type === 'blocker').length;
  const must = findings.filter((f) => f.type === 'must' || f.type === 'warning').length;
  const should = findings.filter((f) => f.type === 'should' || f.type === 'suggestion').length;
  return {
    ...base.summary,
    totalFindings: findings.length,
    blockers,
    must,
    should,
    warnings: must,
    suggestions: should,
  };
}

function buildIssueBlockerAliases(issueId: string): Set<string> {
  const aliases = new Set<string>([issueId]);
  if (issueId.startsWith('issue-')) {
    aliases.add(`coverage-gap:${issueId.slice('issue-'.length)}`);
    aliases.add(issueId.slice('issue-'.length));
  }
  if (issueId.startsWith('coverage-gap:')) {
    aliases.add(`issue-${issueId.slice('coverage-gap:'.length)}`);
  }
  return aliases;
}

export function applyScopeToReport(
  report: TripFeasibilityReportDto,
  scope: FeasibilityScopeDto,
): TripFeasibilityReportDto {
  let issues = report.issues;

  if (scope.type === 'day' && scope.dayNumber) {
    issues = issues.filter((i) => i.affectedDays.includes(scope.dayNumber!));
  } else if (scope.type === 'issue' && scope.issueId) {
    issues = issues.filter(
      (i) =>
        i.id === scope.issueId ||
        i.id === normalizeIssueIdAlias(scope.issueId!) ||
        matchesIssueId(i.id, scope.issueId!),
    );
  } else if (scope.type === 'route' && scope.segmentId) {
    const seg = scope.segmentId!;
    issues = issues.filter(
      (i) =>
        i.id.includes(seg) ||
        i.message.includes(seg) ||
        (i.issueKind === 'inter_day_travel' && seg.includes('drive')) ||
        (i.issueKind === 'same_day_travel' && seg.includes('drive')),
    );
  }

  const issueIds = new Set(issues.map((i) => i.id));
  const scopedDayNumbers =
    scope.type === 'day' && scope.dayNumber
      ? new Set([scope.dayNumber])
      : new Set(issues.flatMap((i) => i.affectedDays));

  const dayTimeline = report.dayTimeline
    .filter((d) => scope.type !== 'day' || d.dayNumber === scope.dayNumber)
    .map((d) => {
      const scopedIssueIds = d.issueIds.filter((id) => issueIds.has(id));
      const dayScopedIssues = issues.filter((i) => i.affectedDays.includes(d.dayNumber));
      let status = d.status;
      if (scopedDayNumbers.has(d.dayNumber)) {
        if (dayScopedIssues.some((i) => i.priority === 'must_handle')) status = 'blocked';
        else if (dayScopedIssues.length > 0) status = 'warning';
        else if (scope.type === 'day') status = 'ok';
      }
      return { ...d, issueIds: scopedIssueIds, status };
    });

  const dimensions = rescopeDimensions(report.dimensions, issues);
  const summary = {
    mustHandle: issues.filter((i) => i.priority === 'must_handle').length,
    suggestAdjust: issues.filter((i) => i.priority === 'suggest_adjust').length,
    pendingConfirm: issues.filter((i) => i.priority === 'pending_confirm').length,
    blockers: issues.filter((i) => i.priority === 'must_handle').length,
  };

  const scopedVerdictStatus = resolveScopedVerdictStatus(summary, issues.length);
  const scopeLabel =
    scope.type === 'day'
      ? `Day ${scope.dayNumber}`
      : scope.type === 'issue'
        ? `issue ${scope.issueId}`
        : `route ${scope.segmentId}`;

  const gateExecute = computeGateExecute(issues);

  return {
    ...report,
    issues,
    dayTimeline,
    dimensions,
    summary,
    gateExecute,
    overallScore: computeScopedOverallScore(dimensions, issues),
    canStartExecute: computeCanStartExecute({
      hasValidation: Boolean(report.verifiedAt),
      isStale: report.isStale,
      verdictStatus: scopedVerdictStatus,
      gateExecute,
    }),
    verdict: {
      status: scopedVerdictStatus,
      headline: scopedVerdictHeadline(scopedVerdictStatus),
      subheadline: `局部验证（${scopeLabel}）：${issues.length} 项问题`,
    },
  };
}

function rescopeDimensions(
  dimensions: FeasibilityDimensionDto[],
  issues: TripFeasibilityReportDto['issues'],
): FeasibilityDimensionDto[] {
  return dimensions.map((dim) => {
    const dimIssues = issues.filter((i) => i.category === dim.key);
    const blockers = dimIssues.filter((i) => i.priority === 'must_handle').length;
    const issueCount = dimIssues.length;
    let statusLabel = '正常';
    if (blockers > 0) statusLabel = `${blockers}项阻塞`;
    else if (issueCount > 0) statusLabel = `${issueCount}项待确认`;
    return {
      ...dim,
      issueCount,
      blockerCount: blockers,
      statusLabel,
    };
  });
}

function resolveScopedVerdictStatus(
  summary: TripFeasibilityReportDto['summary'],
  issueCount: number,
): FeasibilityVerdictStatus {
  if (issueCount === 0) return 'EXECUTABLE';
  if (summary.mustHandle > 0) return 'NOT_EXECUTABLE';
  if (summary.suggestAdjust + summary.pendingConfirm > 0) return 'ADJUST_REQUIRED';
  return 'EXECUTABLE';
}

function scopedVerdictHeadline(status: FeasibilityVerdictStatus): string {
  switch (status) {
    case 'EXECUTABLE':
      return '局部可执行';
    case 'NOT_EXECUTABLE':
      return '局部不可执行';
    case 'ADJUST_REQUIRED':
      return '局部需调整';
    default:
      return '局部待验证';
  }
}

function computeScopedOverallScore(
  dimensions: FeasibilityDimensionDto[],
  issues: TripFeasibilityReportDto['issues'],
): number {
  if (issues.length === 0) return 100;
  const activeDims = dimensions.filter((d) => d.issueCount > 0);
  if (activeDims.length === 0) return 100;
  return Math.round(activeDims.reduce((sum, d) => sum + d.score, 0) / activeDims.length);
}

function normalizeIssueIdAlias(issueId: string): string {
  if (issueId.startsWith('issue-')) return issueId;
  return `issue-${issueId}`;
}

function matchesIssueId(actual: string, requested: string): boolean {
  return (
    actual === requested ||
    actual === normalizeIssueIdAlias(requested) ||
    actual === normalizeIssueIdAlias(`conflict-${requested}`)
  );
}
