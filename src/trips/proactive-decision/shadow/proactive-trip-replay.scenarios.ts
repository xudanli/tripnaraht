/**
 * Phase 4 P1 — Real-trip-shaped replay scenarios (Iceland self-drive).
 * Not synthetic-only fixtures: include trip mode, day, local time, plan items.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';

export type ProactiveTripReplayPlanItem = {
  id: string;
  label: string;
  dayIndex: number;
  kind: 'ACTIVITY' | 'DRIVE_LEG';
};

export type ProactiveTripReplayScenario = {
  id: string;
  labelZh: string;
  /** Looks like production trip id */
  tripId: string;
  countryCode: 'IS';
  tripMode: 'SELF_DRIVE';
  planVersionId: string;
  worldStateSnapshotId: string;
  localTimeHint: string;
  signalKind: ProactiveWorldSignalKind;
  signalEventId: string;
  planItems: ProactiveTripReplayPlanItem[];
  /** Primary affected item id */
  affectedItemId: string;
  windFromMps?: number;
  windToMps?: number;
  roadId?: string;
  activityWindowClosed?: boolean;
  hardBlocked?: boolean;
  needAlternative?: boolean;
  mustRepair?: boolean;
  expected: {
    caseId: ProactiveDecisionCaseId;
    abuRequired: boolean;
    dreRequired: boolean;
    neptuneActivated: boolean;
    forbidKeepOriginal?: boolean;
    optionFamily?: Array<ProactiveOptionId>;
  };
};

/** Golden real-trip replays for Phase 4 */
export const PROACTIVE_TRIP_REPLAY_SCENARIOS: ProactiveTripReplayScenario[] = [
  {
    id: 'REPLAY_IS_REYNISFJARA_WIND',
    labelZh: '冰岛自驾 D4 · Reynisfjara 14→25 m/s @16:00',
    tripId: 'trip_is_selfdrive_south_coast_2026',
    countryCode: 'IS',
    tripMode: 'SELF_DRIVE',
    planVersionId: 'plan_is_south_v3',
    worldStateSnapshotId: 'wss_is_vedur_20260811_1600',
    localTimeHint: '16:00',
    signalKind: 'WEATHER_WIND',
    signalEventId: 'evt_vedur_wind_reynisfjara_1600',
    planItems: [
      {
        id: 'item_vik_morning',
        label: 'Vík 小镇漫步',
        dayIndex: 4,
        kind: 'ACTIVITY',
      },
      {
        id: 'item_reynisfjara',
        label: 'Reynisfjara',
        dayIndex: 4,
        kind: 'ACTIVITY',
      },
      {
        id: 'item_drive_to_kirkjufell',
        label: '南岸→西半岛路段',
        dayIndex: 5,
        kind: 'DRIVE_LEG',
      },
    ],
    affectedItemId: 'item_reynisfjara',
    windFromMps: 14,
    windToMps: 25,
    needAlternative: true,
    expected: {
      caseId: 'CASE_CONTINUE_ACTIVITY',
      abuRequired: true,
      dreRequired: true,
      neptuneActivated: true,
    },
  },
  {
    id: 'REPLAY_IS_F208_CLOSED',
    labelZh: '冰岛自驾 · F208 高地段难度升至不可通行',
    tripId: 'trip_is_selfdrive_highlands_2026',
    countryCode: 'IS',
    tripMode: 'SELF_DRIVE',
    planVersionId: 'plan_is_highlands_v2',
    worldStateSnapshotId: 'wss_is_road_f208_20260811',
    localTimeHint: '09:30',
    signalKind: 'ROAD_DIFFICULTY_CHANGE',
    signalEventId: 'evt_gagnaveita_f208_hard',
    planItems: [
      {
        id: 'item_froad_leg',
        label: 'F208 高地穿越',
        dayIndex: 3,
        kind: 'DRIVE_LEG',
      },
      {
        id: 'item_landmannalaugar',
        label: 'Landmannalaugar',
        dayIndex: 3,
        kind: 'ACTIVITY',
      },
    ],
    affectedItemId: 'item_froad_leg',
    roadId: 'F208',
    hardBlocked: true,
    mustRepair: true,
    needAlternative: true,
    expected: {
      caseId: 'CASE_REROUTE',
      abuRequired: true,
      dreRequired: true,
      neptuneActivated: true,
      forbidKeepOriginal: true,
      optionFamily: ['OPT_REROUTE', 'OPT_CANCEL_ACTIVITY', 'OPT_POSTPONE_NEXT_WINDOW'],
    },
  },
  {
    id: 'REPLAY_IS_GLACIER_WINDOW',
    labelZh: '冰岛自驾 · 冰川徒步天气窗口关闭',
    tripId: 'trip_is_selfdrive_glacier_2026',
    countryCode: 'IS',
    tripMode: 'SELF_DRIVE',
    planVersionId: 'plan_is_glacier_v1',
    worldStateSnapshotId: 'wss_is_blizzard_20260811',
    localTimeHint: '07:00',
    signalKind: 'WEATHER_BLIZZARD',
    signalEventId: 'evt_vedur_blizzard_glacier',
    planItems: [
      {
        id: 'item_glacier_hike',
        label: '冰川徒步',
        dayIndex: 2,
        kind: 'ACTIVITY',
      },
    ],
    affectedItemId: 'item_glacier_hike',
    activityWindowClosed: true,
    needAlternative: true,
    expected: {
      caseId: 'CASE_POSTPONE_ACTIVITY',
      abuRequired: true,
      dreRequired: true,
      neptuneActivated: true,
      optionFamily: [
        'OPT_POSTPONE_NEXT_WINDOW',
        'OPT_INDOOR_SUBSTITUTE',
        'OPT_CANCEL_ACTIVITY',
      ],
    },
  },
];
