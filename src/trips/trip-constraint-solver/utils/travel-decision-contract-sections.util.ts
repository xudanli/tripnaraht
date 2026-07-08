/**
 * 约束控制台 7+2 分区 — 将 TripConstraint[] 映射到旅行决策合同页面结构
 */

import type { TripConstraint } from '../types/trip-constraint.types';
import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  TRIP_CONSTRAINT_OFFICIAL_IS_IDS,
} from '../types/trip-constraint.types';
import type { TravelDecisionContractSection } from '../types/travel-decision-contract.types';

const HARD_CATEGORIES = new Set(['TIME', 'BUDGET', 'TRANSPORT', 'SAFETY']);

function isTeamConstraint(c: TripConstraint): boolean {
  if (c.category === 'MEMBER') return true;
  if (c.source.type === 'MEMBER' || c.source.type === 'PRIVATE_WISH') return true;
  if (c.source.type === 'TEAM_CONSENSUS') return true;
  if (c.backing?.kind === 'wish') return true;
  if (c.id === TRIP_CONSTRAINT_LEGACY_IDS.TRAVELERS) return true;
  if (c.id === TRIP_CONSTRAINT_LEGACY_IDS.DAILY_WALK_LIMIT) return true;
  if (c.id === TRIP_CONSTRAINT_LEGACY_IDS.MUST_PLACES) return true;
  if (c.id === TRIP_CONSTRAINT_LEGACY_IDS.AVOID_PLACES) return true;
  return false;
}

function isOfficialReadonly(c: TripConstraint): boolean {
  return c.source.type === 'OFFICIAL_RULE' || c.id.startsWith('c_official_');
}

function isWorldSnapshot(c: TripConstraint): boolean {
  return c.id === TRIP_CONSTRAINT_LEGACY_IDS.WORLD_FEASIBILITY;
}

function emptySection(
  key: TravelDecisionContractSection['key'],
  label: string,
  extra?: Partial<TravelDecisionContractSection>,
): TravelDecisionContractSection {
  return { key, label, constraintIds: [], ...extra };
}

export function buildTravelDecisionContractSections(
  items: TripConstraint[],
  conflictIds: Set<string>,
): TravelDecisionContractSection[] {
  const hard: string[] = [];
  const soft: string[] = [];
  const team: string[] = [];
  const official: string[] = [];
  const world: string[] = [];

  for (const c of items) {
    if (c.status === 'DISABLED') continue;
    if (isOfficialReadonly(c)) {
      official.push(c.id);
      continue;
    }
    if (isWorldSnapshot(c)) {
      world.push(c.id);
      continue;
    }
    if (c.type === 'SOFT') {
      soft.push(c.id);
      continue;
    }
    if (isTeamConstraint(c)) {
      team.push(c.id);
      continue;
    }
    if (c.type === 'HARD' || HARD_CATEGORIES.has(c.category)) {
      hard.push(c.id);
      continue;
    }
    if (c.type === 'EXTERNAL') {
      soft.push(c.id);
    }
  }

  const conflictConstraintIds = items.filter((c) => conflictIds.has(c.id)).map((c) => c.id);

  return [
    emptySection('travel_objectives', '旅行目标', {
      contractBlock: 'objectives',
    }),
    { key: 'hard_must_satisfy', label: '必须满足', constraintIds: hard },
    { key: 'soft_prefer', label: '尽量满足', constraintIds: soft },
    { key: 'team_members', label: '团队成员', constraintIds: team, contractBlock: 'team_governance' },
    emptySection('change_strategy', '风险与变化策略', {
      contractBlock: 'change_strategy',
    }),
    emptySection('automation', '自动化授权', {
      contractBlock: 'automation',
    }),
    {
      key: 'conflicts_and_impact',
      label: '冲突与影响',
      constraintIds: conflictConstraintIds,
      contractBlock: 'conflicts',
    },
    ...(official.length > 0
      ? [
          {
            key: 'readonly_official' as const,
            label: '目的地规则',
            constraintIds: official,
            readonly: true,
          },
        ]
      : []),
    ...(world.length > 0
      ? [
          {
            key: 'readonly_world' as const,
            label: '实时验证',
            constraintIds: world,
            readonly: true,
          },
        ]
      : []),
  ];
}

/** @deprecated 兼容旧 frontend key；新 UI 应使用 buildTravelDecisionContractSections */
export function buildLegacyConstraintSections(
  countryCode: string | undefined,
  items: TripConstraint[],
): import('../types/trip-constraint.types').TripConstraintsListSection[] | undefined {
  if (!countryCode || countryCode === 'GLOBAL') return undefined;

  const officialIds = items
    .filter((c) => c.source.type === 'OFFICIAL_RULE')
    .map((c) => c.id);
  const userIds = items
    .filter((c) => c.source.type !== 'OFFICIAL_RULE' && c.type !== 'EXTERNAL')
    .map((c) => c.id);
  const snapshotIds = items
    .filter((c) => c.id === TRIP_CONSTRAINT_LEGACY_IDS.WORLD_FEASIBILITY)
    .map((c) => c.id);

  const sections: import('../types/trip-constraint.types').TripConstraintsListSection[] = [
    { key: 'user', label: '你的约束', constraintIds: userIds },
  ];
  if (officialIds.length > 0) {
    sections.push({
      key: 'official',
      label: countryCode === 'IS' ? '冰岛通行规则' : '目的地规则',
      constraintIds: officialIds,
    });
  }
  if (snapshotIds.length > 0) {
    sections.push({ key: 'snapshot', label: '实时验证', constraintIds: snapshotIds });
  }
  return sections;
}

export { TRIP_CONSTRAINT_OFFICIAL_IS_IDS };
