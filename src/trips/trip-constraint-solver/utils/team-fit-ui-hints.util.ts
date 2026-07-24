/**
 * team_fit / team_friction — 前端 CTA 接线（P0-3）
 */

import type { FrictionDomain } from '../../decision-profiling/types/decision-profiling.types';
import type { FeasibilityIssueUiHintsDto } from '../types/trip-constraint-solver.types';

export type TeamFitUiHintsKind =
  | 'member_friction'
  | 'team_fatigue'
  | 'profiling_incomplete';

export function teamPacingIssueKind(
  base: 'friction' | 'fatigue' | 'profiling',
  domain?: FrictionDomain,
): string {
  if (base === 'fatigue') return 'team_pacing_fatigue';
  if (base === 'profiling') return 'team_pacing_profiling';
  return `team_pacing_${domain ?? 'pace'}`;
}

export function buildTeamFitUiHints(input: {
  kind: TeamFitUiHintsKind;
  domain?: FrictionDomain;
  affectedMemberIds?: string[];
  affectedDayNumbers?: number[];
}): FeasibilityIssueUiHintsDto {
  const memberIds = input.affectedMemberIds?.filter(Boolean) ?? [];

  if (input.kind === 'profiling_incomplete') {
    return {
      primaryAction: 'invite_profiling',
      profilingSurface: 'decision_profiling',
      copyVariant: 'profiling_incomplete',
      affectedMemberIds: memberIds,
      deepLink: { tab: 'decision-profiling', subTab: 'onboarding' },
    };
  }

  if (input.kind === 'team_fatigue') {
    return {
      primaryAction: 'open_team_pacing',
      profilingSurface: 'team_pacing',
      copyVariant: 'fatigue_group_capacity',
      affectedMemberIds: memberIds,
      deepLink: {
        tab: 'decision-profiling',
        subTab: 'team_pacing',
        dayIndex: input.affectedDayNumbers?.[0]
          ? Math.max(0, input.affectedDayNumbers[0] - 1)
          : undefined,
      },
    };
  }

  return {
    primaryAction: 'open_decision_profiling',
    profilingSurface: 'decision_profiling',
    copyVariant: `team_friction_${input.domain ?? 'pace'}`,
    affectedMemberIds: memberIds,
    deepLink: {
      tab: 'decision-profiling',
      subTab: 'friction_radar',
      highlightDomains: input.domain ? [input.domain] : undefined,
    },
  };
}
