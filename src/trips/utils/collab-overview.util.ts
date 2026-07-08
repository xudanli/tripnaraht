import type { CollaborativeTaskItem } from '../domain-influence/types/trip-domain.types';
import type { CompatibilityBand } from '../decision-profiling/types/decision-profiling.types';

export function parseCollabOverviewInclude(raw?: string): Set<string> {
  const defaults = ['members', 'tasks', 'domain', 'votes', 'profiling', 'wishes', 'health'];
  if (!raw?.trim()) return new Set(defaults);
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (token) out.add(token);
  }
  return out.size > 0 ? out : new Set(defaults);
}

export function computeCollabTeamHealth(input: {
  profilingCompletionRate: number;
  domainCompletionRate: number;
  collaborativeTasks: CollaborativeTaskItem[];
  openSilentVoteCount: number;
  highFrictionCount: number;
  compatibilityBand?: CompatibilityBand;
}): {
  progressPercent: number;
  discussionCount: number;
  highFrictionCount: number;
  compatibilityBand?: CompatibilityBand;
  status: 'healthy' | 'attention' | 'at_risk';
} {
  const totalTasks = input.collaborativeTasks.length;
  const completedTasks = input.collaborativeTasks.filter(
    (t) => t.status === 'consensus_reached',
  ).length;
  const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;

  const progressPercent = Math.round(
    input.profilingCompletionRate * 0.35 +
      input.domainCompletionRate * 0.35 +
      taskProgress * 0.3,
  );

  const discussionCount =
    input.collaborativeTasks.filter((t) => t.status === 'in_discussion').length +
    input.collaborativeTasks.filter((t) => t.status === 'pending').length +
    input.openSilentVoteCount;

  let status: 'healthy' | 'attention' | 'at_risk' = 'healthy';
  if (input.highFrictionCount > 0 || input.compatibilityBand === 'high_risk') {
    status = 'at_risk';
  } else if (discussionCount > 0 || input.compatibilityBand === 'needs_negotiation') {
    status = 'attention';
  }

  return {
    progressPercent,
    discussionCount,
    highFrictionCount: input.highFrictionCount,
    compatibilityBand: input.compatibilityBand,
    status,
  };
}

export function resolveTravelerCount(metadata: unknown, memberCount: number): number {
  const meta = metadata as { travelers?: unknown[]; party?: { count?: number } } | null;
  if (Array.isArray(meta?.travelers) && meta.travelers.length > 0) {
    return meta.travelers.length;
  }
  if (typeof meta?.party?.count === 'number' && meta.party.count > 0) {
    return meta.party.count;
  }
  return Math.max(memberCount, 1);
}

export function resolveTeamId(metadata: unknown): string | null {
  const meta = metadata as { teamId?: string } | null;
  return meta?.teamId?.trim() || null;
}
