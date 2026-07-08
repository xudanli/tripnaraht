import type { TripDomainInfluenceSnapshot } from '../../../trips/domain-influence/types/trip-domain.types';
import type { WishStructuredHints } from '../../../trips/wishlist/types/trip-wish.types';
import { shouldIncludeDomainInfluenceContext } from '../../../trips/domain-influence/utils/domain-influence-context-blocks.util';
import type { CollaborativeTaskItem } from '../../../trips/domain-influence/types/trip-domain.types';
import type { MoneyDnaCard } from '../../../trips/decision-profiling/types/decision-profiling.types';
import type { ReadinessGuardianNegotiationSnapshot } from '../../../trips/readiness/types/coverage-map.types';
import { buildMoneyDnaSummary } from '../../../trips/decision-profiling/utils/profile-reuse.util';
import type {
  DecisionProfilingDigestV1,
  DomainInfluenceDigestV1,
  NegotiationDigestV1,
  PrivateWishDigestV1,
  WishConstraintDigestV1,
} from '../interfaces/trip-intent-digest.types';

const MAX_HINT_TERMS = 24;
const MAX_PRIVATE_WISH_LINES = 12;

export function buildDomainInfluenceDigestFromSnapshot(
  snapshot: TripDomainInfluenceSnapshot,
): DomainInfluenceDigestV1 | null {
  if (!shouldIncludeDomainInfluenceContext(snapshot)) {
    return null;
  }

  return {
    revision: 'v1',
    memberCount: snapshot.memberCount,
    completionRate: snapshot.completionRate,
    rulesConfirmed: snapshot.rulesConfirmed,
    balanceWarningCount: snapshot.balanceWarnings.length,
    domains: snapshot.domains.map((d) => ({
      domain: d.domain,
      domainLabel: d.domainLabel,
      leaderUserId: d.leaderUserId,
      leaderWeightPercent:
        d.leaderUserId != null
          ? (d.weights.find((w) => w.userId === d.leaderUserId)?.weightPercent ?? null)
          : null,
      crossLevel: d.decisionRule.crossLevel,
      unclaimed: d.unclaimed,
    })),
  };
}

type WishDigestRow = {
  userId: string;
  visibility: string;
  agentEligible: boolean;
  structuredHints: unknown;
  category?: string;
  importance?: number;
  text?: string;
};

export function buildWishConstraintDigest(
  rows: WishDigestRow[],
  requestingUserId: string | null,
): WishConstraintDigestV1 | null {
  const active = rows.filter((r) => r.agentEligible);
  const team = active.filter((r) => r.visibility !== 'private');
  const privateAll = active.filter((r) => r.visibility === 'private');
  const userPrivate =
    requestingUserId != null && requestingUserId !== ''
      ? privateAll.filter((r) => r.userId === requestingUserId)
      : [];

  if (team.length === 0 && privateAll.length === 0) {
    return null;
  }

  const mustDo = new Set<string>();
  const mustAvoid = new Set<string>();
  const uid = requestingUserId?.trim() ?? '';

  for (const row of active) {
    if (row.visibility === 'private' && row.userId !== uid) {
      continue;
    }
    const hints = row.structuredHints as WishStructuredHints | null;
    hints?.must_do?.forEach((x) => {
      if (x?.trim()) mustDo.add(x.trim());
    });
    hints?.must_avoid?.forEach((x) => {
      if (x?.trim()) mustAvoid.add(x.trim());
    });
  }

  return {
    revision: 'v1',
    teamActiveCount: team.length,
    privateActiveCount: privateAll.length,
    requestingUserPrivateCount: userPrivate.length,
    mustDo: [...mustDo].slice(0, MAX_HINT_TERMS),
    mustAvoid: [...mustAvoid].slice(0, MAX_HINT_TERMS),
  };
}

export function buildPrivateWishDigest(
  rows: WishDigestRow[],
  requestingUserId: string | null,
): PrivateWishDigestV1 | null {
  if (!requestingUserId?.trim()) {
    return null;
  }
  const uid = requestingUserId.trim();
  const items = rows
    .filter(
      (r) =>
        r.agentEligible &&
        r.visibility === 'private' &&
        r.userId === uid &&
        typeof r.text === 'string' &&
        r.text.trim().length > 0,
    )
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, MAX_PRIVATE_WISH_LINES)
    .map((r) => ({
      category: String(r.category ?? 'general'),
      importance: r.importance ?? 0,
      text: r.text!.trim(),
    }));

  if (items.length === 0) {
    return null;
  }

  return {
    revision: 'v1',
    requestingUserItemCount: items.length,
    items,
  };
}

type ProfilingStatusRow = {
  userId: string;
  quizCompleted: boolean;
};

type TravelStyleCardRow = {
  styleLabel: string;
  teamRole: string;
};

type MoneyDnaCardRow = Pick<MoneyDnaCard, 'vector' | 'consumptionPace'>;

export function buildDecisionProfilingDigest(input: {
  teamCompletionRate: number;
  requestingUserQuizCompleted: boolean;
  requestingUserStyle: TravelStyleCardRow | null;
  requestingUserMoney: MoneyDnaCardRow | null;
  teamStyleLabels: string[];
  highRiskFrictionDomains: string[];
  splitMechanismLocked: boolean;
  splitMechanismMode: string | null;
}): DecisionProfilingDigestV1 | null {
  const hasStyle =
    input.requestingUserStyle != null ||
    input.teamStyleLabels.length > 0 ||
    input.teamCompletionRate > 0;
  const hasFriction = input.highRiskFrictionDomains.length > 0;
  const hasSplit = input.splitMechanismLocked || input.splitMechanismMode != null;

  if (!hasStyle && !hasFriction && !hasSplit) {
    return null;
  }

  return {
    revision: 'v1',
    teamCompletionRate: input.teamCompletionRate,
    requestingUserQuizCompleted: input.requestingUserQuizCompleted,
    requestingUserStyleLabel: input.requestingUserStyle?.styleLabel ?? null,
    requestingUserTeamRole: input.requestingUserStyle?.teamRole ?? null,
    requestingUserMoneyDnaSummary: input.requestingUserMoney
      ? buildMoneyDnaSummary(input.requestingUserMoney)
      : null,
    teamStyleLabels: input.teamStyleLabels.slice(0, 8),
    highRiskFrictionDomains: input.highRiskFrictionDomains.slice(0, 8),
    splitMechanismLocked: input.splitMechanismLocked,
    splitMechanismMode: input.splitMechanismMode,
  };
}

export function buildNegotiationDigest(input: {
  collaborativeTasks: CollaborativeTaskItem[];
  guardianSnapshot?: ReadinessGuardianNegotiationSnapshot | null;
  splitMechanismLocked: boolean;
  splitMechanismMode: string | null;
}): NegotiationDigestV1 | null {
  const tasks = input.collaborativeTasks.map((t) => ({
    domain: t.domain,
    title: t.title,
    status: t.status,
    statusLabel: t.statusLabel,
    crossLevel: t.crossLevel,
    leaderDisplayName: t.leaderDisplayName,
  }));

  const latest = input.guardianSnapshot?.latest;
  const guardianConsensusLevel =
    latest?.consensusLevel != null ? latest.consensusLevel : null;
  const guardianSummary = latest?.summary?.trim() ? latest.summary.trim() : null;
  const guardianHumanDecisionPointCount = latest?.humanDecisionPoints?.length ?? 0;

  if (
    tasks.length === 0 &&
    guardianConsensusLevel == null &&
    !guardianSummary &&
    !input.splitMechanismLocked &&
    !input.splitMechanismMode
  ) {
    return null;
  }

  return {
    revision: 'v1',
    collaborativeTasks: tasks,
    guardianConsensusLevel,
    guardianSummary,
    guardianHumanDecisionPointCount,
    splitMechanismLocked: input.splitMechanismLocked,
    splitMechanismMode: input.splitMechanismMode,
  };
}
