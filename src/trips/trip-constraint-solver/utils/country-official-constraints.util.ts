/**
 * 目的地官方运营规则 → TripConstraint 只读卡片（GET /constraints SSOT）
 * 规则来源：assets/strategy、Country Pack；不可 PATCH/DELETE。
 */

import type { TripConstraint } from '../types/trip-constraint.types';
import { TRIP_CONSTRAINT_OFFICIAL_IS_IDS } from '../types/trip-constraint.types';
import {
  buildIcelandPoiOfficialConstraints,
  type IcelandTripContextLike,
} from './iceland-poi-official-constraints.util';

type TripRowLike = IcelandTripContextLike;

export function normalizeTripDestinationCode(destination?: string | null): string {
  const raw = (destination ?? '').trim();
  if (!raw) return 'GLOBAL';
  const upper = raw.toUpperCase();
  if (upper === 'ICELAND' || upper === '冰岛') return 'IS';
  if (upper.length === 2) return upper;
  return upper;
}

export function isOfficialConstraintId(id: string): boolean {
  return id.startsWith('c_official_');
}

interface OfficialRuleSeed {
  id: string;
  name: string;
  description: string;
  category: TripConstraint['category'];
  ruleId: string;
  severity: 'CRITICAL' | 'WARNING';
  sourcePath: string;
}

const ICELAND_OFFICIAL_RULES: OfficialRuleSeed[] = [
  {
    id: TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD,
    name: 'F 路须四驱',
    description:
      '2WD 禁止进入 F 路及高地 track（全年适用；典型租车条款与保险也不覆盖此类路段）。',
    category: 'TRANSPORT',
    ruleId: 'STRAT_ICE_002',
    severity: 'CRITICAL',
    sourcePath: 'assets/strategy/iceland-v1.json#two_wheel_drive_f_road_prohibited',
  },
  {
    id: TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WINTER_FROAD,
    name: '冬季 F 路季节性关闭',
    description:
      '11–4 月 F 路及内陆高地走廊通常关闭或不宜普通消费者通行；须以 road.is 等官方开放状态为准。',
    category: 'WORLD_STATE',
    ruleId: 'STRAT_ICE_001',
    severity: 'CRITICAL',
    sourcePath: 'assets/strategy/iceland-v1.json#winter_f_road_prohibited',
  },
  {
    id: TRIP_CONSTRAINT_OFFICIAL_IS_IDS.RED_ALERT,
    name: 'SafeTravel 红色预警',
    description:
      '官方红色（critical）安全警报命中行程区域时，不得建议继续出行；须遵从官方指引与应急服务。',
    category: 'SAFETY',
    ruleId: 'STRAT_ICE_000',
    severity: 'CRITICAL',
    sourcePath: 'assets/strategy/iceland-v1.json#red_alert_life_safety',
  },
  {
    id: TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WIND_SAFETY,
    name: '横风与提车安全',
    description:
      '大风/横风预警下的提车、开门与侧风驾驶操作指引（运营建议，非法律硬门禁）。',
    category: 'SAFETY',
    ruleId: 'STRAT_ICE_003',
    severity: 'WARNING',
    sourcePath: 'assets/strategy/iceland-v1.json#wind_safety_pickup',
  },
];

function buildOfficialCard(
  trip: TripRowLike,
  seed: OfficialRuleSeed,
  userId: string,
): TripConstraint {
  return {
    id: seed.id,
    tripId: trip.id,
    name: seed.name,
    description: seed.description,
    category: seed.category,
    type: 'EXTERNAL',
    status: 'ACTIVE',
    scope: { type: 'DOMAIN' },
    operator: 'CUSTOM',
    value: {
      ruleId: seed.ruleId,
      countryCode: 'IS',
      severity: seed.severity,
    },
    allowRelaxation: seed.severity === 'WARNING',
    locked: true,
    source: { type: 'OFFICIAL_RULE', sourceId: seed.ruleId },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'official_rule', field: seed.sourcePath },
  };
}

export function buildIcelandOfficialConstraints(
  trip: TripRowLike,
  userId: string,
): TripConstraint[] {
  const staticRules = ICELAND_OFFICIAL_RULES.map((seed) => buildOfficialCard(trip, seed, userId));
  const poiRules = buildIcelandPoiOfficialConstraints(trip, userId);
  return [...staticRules, ...poiRules];
}

export function buildCountryOfficialConstraints(
  trip: TripRowLike,
  userId: string,
): TripConstraint[] {
  const code = normalizeTripDestinationCode(trip.destination);
  if (code === 'IS') {
    return buildIcelandOfficialConstraints(trip, userId);
  }
  return [];
}

/** 前端约束控制台分区（按 destination 注入） */
export function buildConstraintsListSections(
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
    .filter((c) => c.id === 'c_world_feasibility')
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
    sections.push({
      key: 'snapshot',
      label: '实时验证',
      constraintIds: snapshotIds,
    });
  }

  return sections;
}

/** 从 planning conflict / feasibility issue 映射到官方规则 constraintId */
export function inferOfficialConstraintIdsFromConflict(
  conflict: import('../types/planning-conflicts.types').PlanningConflictItem,
): string[] {
  const ids = new Set<string>();
  const msg = `${conflict.title} ${conflict.message}`.toLowerCase();
  const issue = conflict.issue;
  const proofBlob = (issue?.proofs ?? [])
    .map((p) => `${p.constraint} ${p.ruleId ?? ''} ${p.conclusion}`)
    .join(' ')
    .toLowerCase();
  const blob = `${msg} ${proofBlob} ${issue?.semanticKey ?? ''} ${issue?.issueKind ?? ''}`.toLowerCase();

  if (
    /f[\s-]?road|f路|高地|内陆|landmannalaugar|2wd|两驱|二驱|vehicle_type_incompatible|terrain\.f_road|froad_2wd|strat_ice_002|four_wheel|4x4|4wd|四驱/.test(
      blob,
    )
  ) {
    ids.add(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD);
  }

  if (
    /winter|冬季|封路|road_closed|road_impassable|snow|积雪|seasonal|strat_ice_001|f208|highland.*clos|impassable/.test(
      blob,
    )
  ) {
    ids.add(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WINTER_FROAD);
  }

  if (
    /red alert|红色预警|红色警报|critical alert|safetravel.*red|strat_ice_000|生命安全|life.safety|avoid_nonessential/.test(
      blob,
    )
  ) {
    ids.add(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.RED_ALERT);
  }

  if (
    /wind|横风|暴风|风暴|storm|gale|strat_ice_003|campervan|房车|wind_campervan|crosswind/.test(blob)
  ) {
    ids.add(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WIND_SAFETY);
  }

  return Array.from(ids);
}
