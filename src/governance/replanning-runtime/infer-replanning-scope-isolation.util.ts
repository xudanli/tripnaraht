import type { GovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import type { ReplanningIntent } from '../activation/governance-activation.types';

const DAY_HINT = /day\s*\d+|第\s*\d+\s*天|d\s*\d+\b|westfjords|西峡湾|segment|段|局部/i;

/**
 * Prefers **segment** isolation when world risks / user text imply a localized corridor failure.
 */
export function inferReplanningScopeIsolation(args: {
  snapshot: GovernanceSnapshot;
  replanningIntent?: ReplanningIntent;
  userMessage?: string;
}): 'day' | 'segment' | 'trip' {
  const intentScope = args.replanningIntent?.replanningScope;
  if (intentScope === 'segment' || intentScope === 'day') return intentScope;

  const risks = args.snapshot.latestWorldRisks.join(' ').toLowerCase();
  const localized =
    /westfjords|west.?fjords|segment|f-road|road_closed|closure|detour/i.test(risks) ||
    DAY_HINT.test(args.userMessage ?? '');

  if (localized && intentScope === 'trip') {
    return 'segment';
  }
  if (localized) return 'segment';
  return intentScope ?? 'trip';
}
