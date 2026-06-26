import type {
  FeasibilityIssueDto,
  FeasibilityIssuePriority,
  FeasibilitySummaryDto,
} from '../types/trip-constraint-solver.types';

const PRIORITY_RANK: Record<FeasibilityIssuePriority, number> = {
  must_handle: 0,
  suggest_adjust: 1,
  pending_confirm: 2,
};

const SEVERITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Stable dedupe key — aligned with C 端 `trip-feasibility-report.adapter` issue 卡片去重。
 * Prefer anchor/id over free-text message (readiness vs conflicts often differ in wording).
 */
export function buildFeasibilityIssueDedupeKey(issue: FeasibilityIssueDto): string {
  if (
    issue.issueKind === 'inter_day_travel' ||
    issue.issueKind === 'same_day_travel'
  ) {
    const from = issue.fromItemId ?? issue.anchors?.fromItemId ?? '';
    const to = issue.toItemId ?? issue.anchors?.toItemId ?? '';
    if (from || to) {
      return `travel:${issue.issueKind}:${from}:${to}`;
    }
  }

  const normalizedId = normalizeIssueIdForDedup(issue.id);
  if (normalizedId && !normalizedId.startsWith('issue-')) {
    return `id:${normalizedId}`;
  }
  if (normalizedId.startsWith('issue-') && !isHashIssueId(normalizedId)) {
    return `id:${normalizedId}`;
  }

  if (issue.fromItemId || issue.toItemId) {
    const days = [...(issue.affectedDays ?? [])].sort((a, b) => a - b).join('|');
    return `anchor:${issue.category}:${issue.issueKind ?? 'generic'}:${issue.fromItemId ?? ''}:${issue.toItemId ?? ''}:${days}`;
  }

  const days = [...(issue.affectedDays ?? [])].sort((a, b) => a - b).join('|');
  return `fallback:${issue.category}:${issue.title}:${days}`;
}

/** C 端展示口径：必处理 / 建议调整 / 待确认（不再合并为「风险」） */
export function buildFeasibilityVerdictSubheadline(
  summary: FeasibilitySummaryDto,
): string | undefined {
  const parts: string[] = [];
  if (summary.mustHandle > 0) parts.push(`${summary.mustHandle} 项必处理`);
  if (summary.suggestAdjust > 0) parts.push(`${summary.suggestAdjust} 项建议调整`);
  if (summary.pendingConfirm > 0) parts.push(`${summary.pendingConfirm} 项待确认`);
  if (parts.length === 0) return undefined;
  return parts.join('、');
}

export function dedupeFeasibilityIssues(issues: FeasibilityIssueDto[]): FeasibilityIssueDto[] {
  const byKey = new Map<string, FeasibilityIssueDto>();
  for (const issue of issues) {
    const key = buildFeasibilityIssueDedupeKey(issue);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeFeasibilityIssues(existing, issue) : issue);
  }
  return [...byKey.values()];
}

function normalizeIssueIdForDedup(id: string): string {
  if (id.startsWith('issue-coverage-gap:')) {
    return `coverage-gap:${id.slice('issue-coverage-gap:'.length)}`;
  }
  if (id.startsWith('coverage-gap:')) return id;
  if (id.startsWith('issue-gap-')) return `coverage-gap:${id.slice('issue-gap-'.length)}`;
  return id;
}

function isHashIssueId(id: string): boolean {
  return /^issue-[a-f0-9]{10}$/.test(id);
}

function pickPreferredIssue(a: FeasibilityIssueDto, b: FeasibilityIssueDto): FeasibilityIssueDto {
  const pa = PRIORITY_RANK[a.priority] ?? 9;
  const pb = PRIORITY_RANK[b.priority] ?? 9;
  if (pa !== pb) return pa < pb ? a : b;

  const sa = SEVERITY_RANK[a.severity] ?? 9;
  const sb = SEVERITY_RANK[b.severity] ?? 9;
  if (sa !== sb) return sa < sb ? a : b;

  const richness = (issue: FeasibilityIssueDto) =>
    (issue.proofs?.length ?? 0) +
    (issue.repairOptions?.length ?? 0) +
    (issue.anchors ? 2 : 0);
  return richness(a) >= richness(b) ? a : b;
}

function mergeFeasibilityIssues(
  a: FeasibilityIssueDto,
  b: FeasibilityIssueDto,
): FeasibilityIssueDto {
  const preferred = pickPreferredIssue(a, b);
  const other = preferred === a ? b : a;
  return {
    ...preferred,
    issueKind:
      preferred.issueKind === 'road_class' || other.issueKind === 'road_class'
        ? 'road_class'
        : preferred.issueKind ?? other.issueKind,
    affectedDays: [
      ...new Set([...(preferred.affectedDays ?? []), ...(other.affectedDays ?? [])]),
    ].sort((x, y) => x - y),
    proofs: preferred.proofs?.length ? preferred.proofs : other.proofs,
    repairOptions: preferred.repairOptions?.length ? preferred.repairOptions : other.repairOptions,
    anchors: preferred.anchors ?? other.anchors,
    uiHints: preferred.uiHints ?? other.uiHints,
  };
}
