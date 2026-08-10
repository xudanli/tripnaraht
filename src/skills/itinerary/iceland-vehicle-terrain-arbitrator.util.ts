/**
 * itinerary.verify V2：冰岛「车型–路况」仲裁（Vehicle–Terrain Arbitrator）
 *
 * 与 Booking MCP 注入的 `research_data.car_rentals`、SafeTravel 警报、行程文本中的 F-road 信号对齐。
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { ItineraryVerifyOutput } from './itinerary-verify.skill';
import { CONSTRAINT_IDS } from '../../agent/services/constraint-registry';
import type { IcelandStrategyDocumentV1 } from '../../agent/strategy/world-strategy.types';
import { listMatchedIcelandDrivingStrategyIds } from '../../agent/strategy/iceland-strategy-eval.util';
import { stripSystemMessageBlocksForIntakeNl } from '../../agent/utils/trip-plan-intake-vehicle.util';
import {
  lexiconMatchFourWheelIntent,
  lexiconMatchTwoWheelIntent,
  normalizeIcelandVehicleIntentText,
} from './iceland-intent-vehicle-lexicon';

export type CarRentalDriveInference = 'likely_2wd_only' | 'four_wheel_present' | 'unknown';

/** 与 TripPlanRequest.constraints.vehicle_type 对齐；由编排层 / VERIFY 透传 */
export type IcelandVehicleIntentHints = {
  constraints_vehicle_type?: '2WD' | '4WD';
  /** 用户长期偏好里的 transport_preferences；可参与四驱词表，不单独制造两驱 CRITICAL */
  transport_preferences?: string;
  /** 画像/偏好长文；可参与四驱词表，不单独制造两驱 CRITICAL */
  preference_text?: string;
};

/** prepareSkillInput 可选注入：不拖整条 OrchestratorState */
export type SkillInputIntentSnapshot = {
  intent_hints?: IcelandVehicleIntentHints;
};

const VIRTUAL_ROW_MARK = '__iceland_virtual_intent_rental';

/**
 * 从 user_query + 结构化 hints 构造「影子」car_rentals 行，仅在真实 MCP 行为空时参与仲裁。
 * 4WD 模式优先于 2WD，避免「Duster 4x4」被误判成经济小车。
 *
 * 两驱虚拟行仅认：显式 constraints.vehicle_type=2WD，或**本轮 user_query** 词表命中。
 * 长期画像 transport_preferences（如「冬季冰岛2WD」）不得单独升 CRITICAL——无真实租车时应走 WARNING。
 */
export function buildVirtualCarRentalRowsFromIntent(
  userQuery: string | undefined,
  hints: IcelandVehicleIntentHints | undefined,
): Record<string, unknown>[] {
  const preferenceBlob = [hints?.transport_preferences ?? '', hints?.preference_text ?? ''].join('\n');
  // 剥离 FITNESS_PROFILE / 长期偏好等系统注入，避免把编排旁路文案当作用户车型意图
  const userNl = stripSystemMessageBlocksForIntakeNl(userQuery ?? '');
  const combined = [userNl, preferenceBlob].join('\n');
  const qCombined = normalizeIcelandVehicleIntentText(combined);
  const qUser = normalizeIcelandVehicleIntentText(userNl);

  if (hints?.constraints_vehicle_type === '4WD') {
    return [{ [VIRTUAL_ROW_MARK]: true, name: 'Intent 4WD', vehicle_class: '4x4', category: 'SUV_4WD', wheelIntent: 'FOUR' }];
  }
  if (hints?.constraints_vehicle_type === '2WD') {
    return [{ [VIRTUAL_ROW_MARK]: true, name: 'Intent 2WD', vehicle_class: 'economy', category: 'SMALL_2WD', wheelIntent: 'TWO' }];
  }

  // 四驱：话术或画像均可（有利于覆盖「已选四驱」类偏好文案）
  if (lexiconMatchFourWheelIntent(qCombined)) {
    return [{ [VIRTUAL_ROW_MARK]: true, name: 'Intent SUV 4WD', vehicle_class: '4x4', category: 'SUV_4WD', wheelIntent: 'FOUR' }];
  }
  // 两驱：仅本轮用户原话，避免 standing preference / FITNESS 注入污染
  if (lexiconMatchTwoWheelIntent(qUser)) {
    return [{ [VIRTUAL_ROW_MARK]: true, name: 'Intent small 2WD', vehicle_class: 'economy', category: 'SMALL_2WD', wheelIntent: 'TWO' }];
  }

  return [];
}

function isVirtualIntentRow(row: unknown): boolean {
  return Boolean(row && typeof row === 'object' && (row as Record<string, unknown>)[VIRTUAL_ROW_MARK] === true);
}

function blobItineraryText(itinerary: Itinerary): string {
  const parts: string[] = [];
  for (const d of itinerary.days ?? []) {
    parts.push(d.date ?? '');
    for (const it of d.items ?? []) {
      parts.push(
        [it.type, it.notes, it.location_ref?.name, (it as { metadata?: { route_segment_ref?: string } }).metadata?.route_segment_ref].filter(Boolean).join(' '),
      );
    }
  }
  return parts.join('\n');
}

/** 行程文本或路段 ref 是否暗示 F-road / 高地（保守启发式） */
export function itineraryImpliesFRoadOrHighland(itinerary: Itinerary): boolean {
  const b = blobItineraryText(itinerary);
  return (
    /\bF\s*\d{2,3}\b|f-road|高地|内陆|中央高地|Landmannalaugar|Þórsmörk|Thorsmork|Askja|Kverkfjöll|Kerlingarfjöll/i.test(
      b,
    ) || /ring-road:.*highland|highland.*corridor/i.test(b)
  );
}

export function isIcelandContextForArbitration(researchData: Record<string, unknown> | undefined): boolean {
  if (!researchData) return false;
  const cc = String(
    researchData.country_code ?? researchData.countryCode ?? researchData.destination_country ?? '',
  ).toUpperCase();
  if (cc === 'IS' || cc === 'ISL') return true;
  if (Array.isArray(researchData.safetravel_alerts) && researchData.safetravel_alerts.length > 0) return true;
  const wm = researchData.world_model_context ?? researchData.world;
  if (wm && typeof wm === 'object') {
    const wcc = String((wm as { countryCode?: string }).countryCode ?? '').toUpperCase();
    if (wcc === 'IS') return true;
  }
  return false;
}

/** 供 Decision Memory / 外部 trace 与 `collectIcelandVehicleTerrainArbitrationIssues` 共用 */
export function extractCarRentalRowsFromResearch(researchData: Record<string, unknown> | undefined): unknown[] {
  if (!researchData) return [];
  const raw = researchData.car_rentals ?? researchData.carRentals;
  if (Array.isArray(raw)) return raw;
  const nested = (raw as { data?: unknown[] })?.data;
  return Array.isArray(nested) ? nested : [];
}

/** 从 Booking MCP 行里粗判是否出现四驱；或是否「仅经济/小型」启发式 */
export function inferCarRentalDriveFromResearchRows(rows: unknown[] | undefined): CarRentalDriveInference {
  if (!rows?.length) return 'unknown';
  let any4 = false;
  let any2Hint = false;
  for (const row of rows) {
    if (row && typeof row === 'object' && 'wheelIntent' in (row as object)) {
      const wi = String((row as { wheelIntent?: string }).wheelIntent ?? '').toUpperCase();
      if (wi === 'FOUR') {
        any4 = true;
        break;
      }
      if (wi === 'TWO') {
        any2Hint = true;
        continue;
      }
    }
    const t = JSON.stringify(row ?? '').toLowerCase();
    if (
      /\b4x4\b|\b4wd\b|\bawd\b|四驱|全驱|\bsuv\b|jeep|defender|land\s*cruiser|high clearance|高离地|off[-\s]?road capable|four\s+wheel/i.test(
        t,
      )
    ) {
      any4 = true;
      break;
    }
    if (/\b2wd\b|两驱|二驱|economy|compact|mini|微型|小型|up to 4 passengers/i.test(t)) {
      any2Hint = true;
    }
  }
  if (any4) return 'four_wheel_present';
  if (any2Hint) return 'likely_2wd_only';
  return 'unknown';
}

/** 冰岛租车钉胎窗口：11/1–次年 4/15（与行程任一日重叠即提示） */
export function tripOverlapsIcelandWinterStuddedWindow(itinerary: Itinerary): boolean {
  for (const d of itinerary.days ?? []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.date ?? '');
    if (!m) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month === 11 || month === 12 || month === 1 || month === 2 || month === 3) return true;
    if (month === 4 && day <= 15) return true;
  }
  return false;
}

function alertBlob(a: Record<string, unknown>): string {
  const title = String(a.title ?? '');
  const summary = String(a.summary ?? a.description ?? '');
  return `${title} ${summary}`.toLowerCase();
}

function alertSeverityRank(a: Record<string, unknown>): number {
  const s = String(a.severity ?? 'medium').toLowerCase();
  if (s === 'critical') return 4;
  if (s === 'high' || s === 'error') return 3;
  if (s === 'medium') return 2;
  return 1;
}

/** SafeTravel 警报是否像「大风/风暴」且达到中高严重度（与提车意图组合用） */
export function safetravelWindStormSignal(researchData: Record<string, unknown> | undefined): boolean {
  const raw = researchData?.safetravel_alerts;
  const alerts: unknown[] = Array.isArray(raw) ? raw : [];
  for (const x of alerts) {
    if (!x || typeof x !== 'object') continue;
    const a = x as Record<string, unknown>;
    const blob = alertBlob(a);
    const windish = /风|暴风|风暴|大风|横风|gale|storm|orange|红色|red alert|weather warning/i.test(blob);
    if (!windish) continue;
    if (alertSeverityRank(a) >= 2 && /high|critical|error|橙色|红色|severe/i.test(String(a.severity ?? '') + blob)) {
      return true;
    }
    if (alertSeverityRank(a) >= 3) return true;
  }
  return false;
}

export function userQueryImpliesVehiclePickup(userQuery: string | undefined): boolean {
  const q = (userQuery ?? '').trim();
  if (!q) return false;
  return /提车|取车|拿车|换车|领车|去车行|到车行|pick\s*up.*(car|vehicle|rental)|collect\s+(the\s+)?(car|vehicle)/i.test(q);
}

/**
 * 产出追加的 verify issues（不修改 itinerary；由 ItineraryVerifySkill 合并进 issues）。
 */
export function collectIcelandVehicleTerrainArbitrationIssues(params: {
  itinerary: Itinerary;
  research_data?: Record<string, any>;
  user_query?: string;
  intent_hints?: IcelandVehicleIntentHints;
  /** 可选：WorldStrategyService 注入的冰岛 v1 文档；用于 refIds 打 strat: 与 causedBy 对齐 */
  world_strategy?: IcelandStrategyDocumentV1;
}): ItineraryVerifyOutput['issues'] {
  const { itinerary, research_data, user_query, intent_hints, world_strategy } = params;
  const issues: ItineraryVerifyOutput['issues'] = [];
  const iceland = isIcelandContextForArbitration(research_data);
  const fRoad = itineraryImpliesFRoadOrHighland(itinerary);
  const realRows = extractCarRentalRowsFromResearch(research_data);
  const virtualRows = realRows.length > 0 ? [] : buildVirtualCarRentalRowsFromIntent(user_query, intent_hints);
  const rows = realRows.length > 0 ? realRows : virtualRows;
  const drive = inferCarRentalDriveFromResearchRows(rows);
  const intentVirtual2wd =
    fRoad &&
    drive === 'likely_2wd_only' &&
    rows.length > 0 &&
    rows.every((r) => isVirtualIntentRow(r));

  if (fRoad && drive === 'likely_2wd_only') {
    const stratIds = listMatchedIcelandDrivingStrategyIds(world_strategy, {
      itinerary,
      fRoad,
      drive,
      icelandContext: iceland,
    });
    const stratRefIds = stratIds.map((id) => `strat:${id}`);
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'CRITICAL',
      message: intentVirtual2wd
        ? '行程里包含冰岛 F 路或高地路段，而当前信息指向两驱/经济型车。这类路段通常要求四驱，且违法风险与事故风险都很高，一般车险也不保此类路段。请先改订允许上 F 路的四驱车，或改走不含 F 路的路线。'
        : '行程里包含冰岛 F 路或高地路段，但租车信息更像两驱/经济型车。F 路通常禁止不合规车辆进入，且保险可能不覆盖。请升级车型或改线。',
      suggestion:
        '立即改订合规四驱（高离地）或改线避开 F-road；出发前用 road.is 核对开放状态，并联系车行确认车辆等级与砂石/风损条款。',
      violation: {
        anchor: {
          constraintId: CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY,
          ruleId: intentVirtual2wd
            ? 'itinerary.verify:iceland_vehicle_terrain_v2:froad_2wd_intent'
            : 'itinerary.verify:iceland_vehicle_terrain_v2:froad_2wd',
        },
        entityRef: { type: 'OTHER', id: 'vehicle_terrain_arbitrator' },
        evidence: {
          source: 'MODEL',
          refIds: [
            ...(intentVirtual2wd ? ['user_query', 'intent_virtual_car_rental', 'itinerary_text'] : ['car_rentals', 'itinerary_text']),
            ...stratRefIds,
          ],
        },
        scope: 'GLOBAL',
      },
    });
  } else if (fRoad && drive === 'unknown' && rows.length > 0) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'WARNING',
      message:
        '行程里可能包含冰岛 F 路或高地，但无法在租车信息里确认是否为四驱。若确实要开 F 路，请向车行书面确认车型等级，并用 road.is 等核对路段开放情况。',
      suggestion: '在订单与车行确认 4WD/离地间隙；用 road.is + SafeTravel 复核封路与风况。',
      violation: {
        anchor: { constraintId: CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY, ruleId: 'itinerary.verify:iceland_vehicle_terrain_v2:froad_unknown_class' },
        entityRef: { type: 'OTHER', id: 'vehicle_terrain_arbitrator' },
        evidence: { source: 'MODEL' },
        scope: 'GLOBAL',
      },
    });
  } else if (fRoad && rows.length === 0) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'WARNING',
      message:
        '行程文字里可能涉及冰岛 F 路或高地，但系统还没有可用的租车订单信息，也无法从话术中确定车型。若要走 F 路，请预订合规四驱并补充租车信息，或先改走普通公路。',
      suggestion: '若计划驶入 F-road，请预订合规四驱并在 research 流程中注入 car_rentals 或手动确认。',
      violation: {
        anchor: { constraintId: CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY, ruleId: 'itinerary.verify:iceland_vehicle_terrain_v2:froad_no_rental_rows' },
        entityRef: { type: 'OTHER', id: 'vehicle_terrain_arbitrator' },
        evidence: { source: 'RULE' },
        scope: 'GLOBAL',
      },
    });
  }

  if (iceland && tripOverlapsIcelandWinterStuddedWindow(itinerary) && (realRows.length > 0 || virtualRows.length > 0)) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'WARNING',
      message:
        '行程日期落在冰岛典型冬季窗口。请确认车辆配备合规冬季/钉胎，并关注封路与天气预警。',
      suggestion: '向车行书面确认钉胎或等效冬季装备；降雪封路以 road.is 为准。',
      violation: {
        anchor: { constraintId: CONSTRAINT_IDS.ENVIRONMENT_EXTREME_WEATHER_CLOSURE, ruleId: 'itinerary.verify:iceland_vehicle_terrain_v2:studded_tires' },
        entityRef: { type: 'OTHER', id: 'vehicle_terrain_arbitrator' },
        evidence: { source: 'MODEL' },
        scope: 'GLOBAL',
      },
    });
  }

  if (iceland && userQueryImpliesVehiclePickup(user_query) && safetravelWindStormSignal(research_data)) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'WARNING',
      message:
        '路况提示风况较强，且您的话术涉及取还车。开门时注意横风、防止车门被风吹损；必要时可联系车行延后取车。',
      suggestion: '查阅 vedur.is 风速与警报；停车选背风侧，双手控门；确认保险是否覆盖风损/开门磕碰。',
      violation: {
        anchor: { constraintId: CONSTRAINT_IDS.ENVIRONMENT_WIND_SPEED_LIMIT, ruleId: 'itinerary.verify:iceland_vehicle_terrain_v2:wind_pickup' },
        entityRef: { type: 'OTHER', id: 'vehicle_terrain_arbitrator' },
        evidence: { source: 'WEATHER' },
        scope: 'GLOBAL',
      },
    });
  }

  return issues;
}
