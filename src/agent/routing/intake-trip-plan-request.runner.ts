/**
 * INTAKE：RouteAndRun → TripPlanRequest 转换与绑定 Trip 回填（从 ClaudeOrchestrator 迁出）。
 */

import type { IntakeTripPlanRequestHost } from './intake-trip-plan-request.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  applyBoundTripDateAuthority,
  parseIntakeNlDatesAndDays,
} from '../utils/trip-plan-intake-dates.util';
import {
  buildUserAuthoredIntakeTextBundle,
  extractVehicleTypeFromCurrentUserMessage,
  stripSystemMessageBlocksForIntakeNl,
} from '../utils/trip-plan-intake-vehicle.util';
import { shouldPreferTripDestinationOnHydration } from '../utils/itinerary-adjust-intent.util';
import { hydrateRelaxationConstraintsFromTripRecord } from '../utils/trip-relaxation-hydrate.util';
import { resolveRouteRunPartyProfileSnapshot } from '../utils/route-and-run-party-profile.util';

export function convertToTripPlanRequest(
  request: RouteAndRunRequestDto,
  _state: OrchestratorState,
): TripPlanRequest {
  // 提取目的地（扩展规则匹配）
  let destination: string | { lat: number; lng: number } | undefined;

  const structIn = request.structured_travel_input;
  const structDest =
    typeof structIn?.destination === 'string' ? structIn.destination.trim() : '';
  const structOrigin =
    typeof structIn?.origin === 'string' ? structIn.origin.trim() : '';
  // 目的地/日期仅认用户侧 NL：剔除助手行与 ContextEnricher「系统注入」偏好/行程摘要，
  // 避免「偏好从杭州自驾出发」把绑定冰岛行程误写成目的地杭州。
  const textForIntake = buildUserAuthoredIntakeTextBundle(
    stripSystemMessageBlocksForIntakeNl(String(request.message ?? '')),
    request.conversation_context?.recent_messages,
  );
  const vehicle_type = extractVehicleTypeFromCurrentUserMessage(request.message);

  // 国内常见城市（先于国家级关键词，便于「上海美食2天」等短句命中目的地）
  const domesticCityPatterns: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /上海/, value: '上海' },
    { pattern: /北京/, value: '北京' },
    { pattern: /广州/, value: '广州' },
    { pattern: /深圳/, value: '深圳' },
    { pattern: /杭州/, value: '杭州' },
    { pattern: /成都/, value: '成都' },
    { pattern: /重庆/, value: '重庆' },
    { pattern: /西安/, value: '西安' },
    { pattern: /南京/, value: '南京' },
    { pattern: /苏州/, value: '苏州' },
    { pattern: /武汉/, value: '武汉' },
    { pattern: /厦门/, value: '厦门' },
    { pattern: /青岛/, value: '青岛' },
    { pattern: /天津/, value: '天津' },
    { pattern: /香港|hong\s*kong/i, value: '香港' },
    { pattern: /澳门|macau/i, value: '澳门' },
    { pattern: /台北|台湾|taiwan/i, value: '台北' },
    { pattern: /东京|tokyo/i, value: '东京' },
    { pattern: /大阪|osaka/i, value: '大阪' },
    { pattern: /京都|kyoto/i, value: '京都' },
    { pattern: /首尔|seoul/i, value: '首尔' },
  ];
  for (const { pattern, value } of domesticCityPatterns) {
    if (pattern.test(textForIntake)) {
      destination = value;
      break;
    }
  }

  const destinationPatterns = [
    { pattern: /冰岛|iceland/i, value: '冰岛' },
    { pattern: /尼泊尔|nepal/i, value: '尼泊尔' },
    { pattern: /瑞士|switzerland/i, value: '瑞士' },
    { pattern: /日本|japan/i, value: '日本' },
    { pattern: /韩国|korea|south korea/i, value: '韩国' },
    { pattern: /泰国|thailand/i, value: '泰国' },
    { pattern: /新加坡|singapore/i, value: '新加坡' },
    { pattern: /马来西亚|malaysia/i, value: '马来西亚' },
    { pattern: /印度尼西亚|indonesia/i, value: '印度尼西亚' },
    { pattern: /菲律宾|philippines/i, value: '菲律宾' },
    { pattern: /越南|vietnam/i, value: '越南' },
  ];
  if (!destination) {
    for (const { pattern, value } of destinationPatterns) {
      if (pattern.test(textForIntake)) {
        destination = value;
        break;
      }
    }
  }

  const tripIdBound = Boolean(request.trip_id?.trim());
  const nlDates = parseIntakeNlDatesAndDays(textForIntake, {
    refYear: new Date().getFullYear(),
    tripIdBound,
  });
  let start_date = nlDates.start_date;
  let date_range = nlDates.date_range;
  let days = nlDates.duration_days;

  // 提取人数（简单规则）
  let partyCount = 1;
  const countPatterns = [
    /(\d+)\s*人/,
    /(\d+)\s*位/,
    /(\d+)\s*个/,
    /(\d+)\s*persons?/i,
    /(\d+)\s*people/i,
  ];
  for (const pattern of countPatterns) {
    const countMatch = textForIntake.match(pattern);
    if (countMatch) {
      const extractedCount = parseInt(countMatch[1], 10);
      if (extractedCount > 0 && extractedCount <= 20) {
        partyCount = extractedCount;
        break;
      }
    }
  }

  // 提取交通模式（如果有明确指定）
  let mode: 'walk' | 'drive' | 'transit' | 'mixed' = 'mixed';
  if (/步行|走路|walk/i.test(textForIntake)) {
    mode = 'walk';
  } else if (/开车|自驾|drive|car/i.test(textForIntake)) {
    mode = 'drive';
  } else if (/公交|地铁|transit|public transport/i.test(textForIntake)) {
    mode = 'transit';
  }

  // 未命中关键词表时：从「在X的…行程」抽取 X（覆盖 Reykjavik、雷克雅未克市区等）
  if (
    !destination ||
    (typeof destination === 'string' && (destination === '未指定' || !destination.trim()))
  ) {
    const geo = textForIntake.match(/在\s*([^，。！？\n]{1,60}?)\s*的/);
    if (geo) {
      const raw = geo[1].trim().replace(/\s+/g, ' ');
      if (
        raw.length >= 2 &&
        raw.length <= 56 &&
        !/^(这里|那里|这边|那边|本地)$/u.test(raw)
      ) {
        destination = raw;
      }
    }
  }

  // 结构化输入最后覆盖 NL，保证澄清回合显式目的地生效
  if (structDest.length >= 2) {
    destination = structDest;
  }

  // 结构化日期（与澄清 UI / 日期选择器对齐）：不依赖 message 中是否带 YYYY-MM-DD
  const stStart = typeof structIn?.start_date === 'string' ? structIn.start_date.trim() : '';
  const stEnd = typeof structIn?.end_date === 'string' ? structIn.end_date.trim() : '';
  if (stStart && /^\d{4}-\d{2}-\d{2}$/.test(stStart)) {
    start_date = stStart;
  }
  if (stStart && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stEnd)) {
    const a = new Date(`${stStart}T12:00:00.000Z`);
    const b = new Date(`${stEnd}T12:00:00.000Z`);
    if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() >= a.getTime()) {
      date_range = { start_date: stStart, end_date: stEnd };
      start_date = stStart;
    }
  } else if (!date_range && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stEnd) && start_date) {
    const a = new Date(`${start_date}T12:00:00.000Z`);
    const b = new Date(`${stEnd}T12:00:00.000Z`);
    if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() >= a.getTime()) {
      date_range = { start_date, end_date: stEnd };
    }
  }

  const routeParty = resolveRouteRunPartyProfileSnapshot(request);
  const partyCountEffective =
    routeParty?.party_total != null && routeParty.party_total >= 1 ? routeParty.party_total : partyCount;
  const party: TripPlanRequest['party'] = {
    count: partyCountEffective,
    ...(routeParty?.has_children !== undefined ? { has_children: routeParty.has_children } : {}),
    ...(routeParty?.has_elderly !== undefined ? { has_elderly: routeParty.has_elderly } : {}),
    ...(routeParty?.fitness_level ? { fitness_level: routeParty.fitness_level } : {}),
  };
  const party_profile: TripPlanRequest['party_profile'] | undefined =
    routeParty && (routeParty.risk_tolerance != null || routeParty.fitness_level != null)
      ? {
          ...(routeParty.risk_tolerance ? { risk_tolerance: routeParty.risk_tolerance } : {}),
          ...(routeParty.fitness_level ? { fitness: routeParty.fitness_level } : {}),
        }
      : undefined;
  const party_profile_clean =
    party_profile && Object.keys(party_profile).length > 0 ? party_profile : undefined;

  return {
    request_id: request.request_id,
    // Carry raw NL message forward for deterministic intake compile & predictive simulation.
    // This is intentionally duplicated from the API request and treated as non-authoritative hint.
    message: request.message,
    origin: structOrigin.length >= 1 ? structOrigin : '起点', // 默认值，实际应该从 message 或上下文提取
    destination: destination || '未指定',
    date_range,
    start_date,
    days,
    mode,
    party,
    ...(party_profile_clean ? { party_profile: party_profile_clean } : {}),
    ...(routeParty?.mobility_note_zh ? { party_mobility_note_zh: routeParty.mobility_note_zh } : {}),
    ...(vehicle_type ? { constraints: { vehicle_type } } : {}),
    ...(request.options?.persona_hint ? { persona_hint: request.options.persona_hint as TripPlanRequest['persona_hint'] } : {}),
  };
}

/** INTAKE 回填所需的最小 Trip 字段（与 {@link TripsService.findOne} 校验语义对齐） */
export async function loadTripCoreForIntakeHydration(
  host: IntakeTripPlanRequestHost,
  tripId: string,
  userId: string | undefined,
): Promise<
  | {
      ok: true;
      trip: {
        destination: string | null;
        startDate: Date | null;
        endDate: Date | null;
        budgetConfig?: unknown;
        pacingConfig?: unknown;
        metadata?: unknown;
      };
      source: 'trips_service' | 'prisma_fallback';
    }
  | { ok: false; error_message: string }
> {
  const tid = tripId.trim();

  if (host.tripsService) {
    try {
      const full = await host.tripsService.findOne(tid, userId);
      const destRaw = full.destination;
      const destNorm =
        destRaw == null ? '' : typeof destRaw === 'string' ? destRaw.trim() : String(destRaw).trim();
      return {
        ok: true,
        trip: {
          destination: destNorm || null,
          startDate: full.startDate ?? null,
          endDate: full.endDate ?? null,
          budgetConfig: (full as { budgetConfig?: unknown }).budgetConfig,
          pacingConfig: (full as { pacingConfig?: unknown }).pacingConfig,
          metadata: (full as { metadata?: unknown }).metadata,
        },
        source: 'trips_service',
      };
    } catch (e: unknown) {
      return { ok: false, error_message: (e as Error)?.message ?? String(e) };
    }
  }

  const uid = userId?.trim();
  if (uid) {
    const collaborator = await host.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId: tid, userId: uid } },
    });
    if (!collaborator) {
      return {
        ok: false,
        error_message: `行程 ID ${tid} 不存在或您没有权限访问`,
      };
    }
  }

  const row = await host.prisma.trip.findUnique({
    where: { id: tid },
    select: {
      destination: true,
      startDate: true,
      endDate: true,
      budgetConfig: true,
      pacingConfig: true,
      metadata: true,
    },
  });
  if (!row) {
    return { ok: false, error_message: `行程 ID ${tid} 不存在` };
  }
  return { ok: true, trip: row, source: 'prisma_fallback' };
}

/** Trip 库 destination 码表 → 规划用可读地名 */
export function normalizeTripRecordDestinationForPlanning(tripDest: string): string {
  const t = tripDest.trim();
  if (!t) return '';
  const upper = t.toUpperCase();
  if (upper === 'IS') return '冰岛';
  if (upper === 'JP') return '日本';
  if (upper === 'KR') return '韩国';
  if (upper === 'CN') return '中国';
  return t;
}

/**
 * 绑定 trip_id 时，用库中 Trip 回填 destination / date_range。
 * 结果写入 `state.metadata.trip_hydration`，便于日志与 debug UI（orchestrationResult.state.metadata）。
 *
 * `TripsService` 可能因循环依赖等未注入；与轻量咨询一致，此时回退 Prisma 直连（权限校验与 findOne 对齐）。
 */
export async function hydrateTripPlanRequestFromTripRecord(
  host: IntakeTripPlanRequestHost,
  request: RouteAndRunRequestDto,
  tripPlanRequest: TripPlanRequest,
  state: OrchestratorState,
): Promise<void> {
  const setHydration = (payload: Record<string, unknown>) => {
    state.metadata = {
      ...(state.metadata ?? {}),
      trip_hydration: payload,
    } as any;
  };

  const tid = request.trip_id?.trim();
  if (!tid) {
    setHydration({
      attempted: false,
      status: 'no_trip_id',
      detail: '请求未带 trip_id，跳过行程回填',
    });
    return;
  }

  const loaded = await loadTripCoreForIntakeHydration(host, tid, request.user_id);
  if (loaded.ok === false) {
    const msg = loaded.error_message;
    setHydration({
      attempted: true,
      trip_id: tid,
      user_id: request.user_id,
      status: 'load_failed',
      error_message: msg,
      detail: `读取 Trip 失败（权限/不存在）：${msg}`,
      hydration_source: host.tripsService ? 'trips_service' : 'prisma_fallback',
    });
    host.logger.warn(`[INTAKE] trip_hydration load_failed trip_id=${tid} user_id=${request.user_id}: ${msg}`);
    return;
  }

  const trip = loaded.trip;
  if (loaded.source === 'prisma_fallback') {
    host.logger.warn(
      `[INTAKE] trip_hydration: TripsService 未注入，已用 Prisma 回退回填 trip_id=${tid} user_id=${request.user_id ?? 'n/a'}`,
    );
  }

  const hydrationSource = loaded.source;

  const destUnset =
    tripPlanRequest.destination == null ||
    tripPlanRequest.destination === '未指定' ||
    (typeof tripPlanRequest.destination === 'string' && !String(tripPlanRequest.destination).trim());

  const tripDestRaw =
    trip.destination == null
      ? ''
      : typeof trip.destination === 'string'
        ? trip.destination.trim()
        : String(trip.destination).trim();
  const tripDest = normalizeTripRecordDestinationForPlanning(tripDestRaw);
  const tripHasDest = Boolean(tripDest);
  const tripHasDates = Boolean(trip.startDate && trip.endDate);

  const filledFields: string[] = [];

  const planDestStr =
    typeof tripPlanRequest.destination === 'string' ? tripPlanRequest.destination.trim() : '';
  if (
    tripDest &&
    (destUnset || shouldPreferTripDestinationOnHydration(planDestStr, tripDest))
  ) {
    tripPlanRequest.destination = tripDest;
    filledFields.push(destUnset ? 'destination' : 'destination_trip_authority');
  }

  const structIn = request.structured_travel_input;
  const stStart = typeof structIn?.start_date === 'string' ? structIn.start_date.trim() : '';
  const stEnd = typeof structIn?.end_date === 'string' ? structIn.end_date.trim() : '';
  const structuredHasDates =
    Boolean(stStart && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stStart) && /^\d{4}-\d{2}-\d{2}$/.test(stEnd));

  // 与 convertToTripPlanRequest 同源：日期权威判定不得吃到系统注入偏好里的历史日期
  const textForHydration = buildUserAuthoredIntakeTextBundle(
    stripSystemMessageBlocksForIntakeNl(String(request.message ?? '')),
    request.conversation_context?.recent_messages,
  );
  const nlParse = parseIntakeNlDatesAndDays(textForHydration, {
    refYear: new Date().getFullYear(),
    tripIdBound: true,
  });

  if (trip.startDate && trip.endDate) {
    const start =
      trip.startDate instanceof Date
        ? trip.startDate.toISOString().slice(0, 10)
        : String(trip.startDate).slice(0, 10);
    const end =
      trip.endDate instanceof Date
        ? trip.endDate.toISOString().slice(0, 10)
        : String(trip.endDate).slice(0, 10);

    const authority = applyBoundTripDateAuthority({
      tripStart: start,
      tripEnd: end,
      plan: {
        start_date: tripPlanRequest.start_date,
        date_range: tripPlanRequest.date_range,
        days: tripPlanRequest.days,
      },
      nlParse,
      structuredHasDates,
    });

    const hadPlanDates = Boolean(
      tripPlanRequest.start_date ||
        (tripPlanRequest.date_range?.start_date && tripPlanRequest.date_range?.end_date),
    );

    tripPlanRequest.date_range = authority.date_range;
    tripPlanRequest.start_date = authority.start_date;
    tripPlanRequest.days = authority.days;

    if (!hadPlanDates || authority.authority === 'trip_record') {
      filledFields.push('date_range', 'start_date', 'days');
    } else if (authority.authority === 'nl_override') {
      filledFields.push('date_range', 'start_date', 'days', 'nl_override');
    } else if (authority.authority === 'structured') {
      filledFields.push('date_range', 'start_date', 'days', 'structured');
    }

    if (authority.overwritten_nl_fields.length > 0) {
      filledFields.push('trip_date_authority_overwrite');
    }

    (state.metadata as Record<string, unknown>).trip_date_authority = authority.authority;
  }

  tripPlanRequest.ontology_context = {
    ...(tripPlanRequest.ontology_context ?? {}),
    trip_id: tid,
  };

  const relaxationFilled = hydrateRelaxationConstraintsFromTripRecord(tripPlanRequest, trip);
  if (relaxationFilled.length > 0) {
    filledFields.push(...relaxationFilled);
  }

  const planDatesMissing =
    !tripPlanRequest.start_date &&
    !(tripPlanRequest.date_range?.start_date && tripPlanRequest.date_range?.end_date);

  const status = filledFields.length > 0 ? 'applied' : 'noop';
  const sparseDb =
    (destUnset && !tripHasDest) || (planDatesMissing && !tripHasDates);
  const dateAuthority = (state.metadata as Record<string, unknown>)?.trip_date_authority as
    | string
    | undefined;
  const detail =
    filledFields.length > 0
      ? dateAuthority === 'trip_record' && filledFields.includes('trip_date_authority_overwrite')
        ? `已用绑定 Trip 起止日期覆盖 NL 误解析（${filledFields.join(', ')}）`
        : `已从 Trip 回填：${filledFields.join(', ')}`
      : sparseDb
        ? 'Trip 已加载，但库中缺少可回填的目的地或起止日期（且请求侧仍为占位/缺日期）'
        : 'Trip 已加载，请求侧已有目的地/日期，无需回填';

  // Policy Projector 输入：合同 / icelandSelfDrive / constraints（OPTIMIZE 快照，勿在 CGUS 内再读库）
  const rawMeta =
    trip.metadata && typeof trip.metadata === 'object'
      ? (trip.metadata as Record<string, unknown>)
      : {};
  const tripMetadataForPolicy: Record<string, unknown> = {
    ...rawMeta,
    ...(trip.pacingConfig && typeof trip.pacingConfig === 'object'
      ? { pacing: trip.pacingConfig as Record<string, unknown> }
      : {}),
    ...(trip.budgetConfig != null ? { budgetConfig: trip.budgetConfig } : {}),
  };
  state.metadata = {
    ...(state.metadata ?? {}),
    trip_metadata: tripMetadataForPolicy,
  } as any;

  setHydration({
    attempted: true,
    trip_id: tid,
    user_id: request.user_id,
    status,
    hydration_source: hydrationSource,
    filled_fields: filledFields,
    trip_destination_present: tripHasDest,
    trip_dates_present: tripHasDates,
    plan_destination_was_placeholder: destUnset,
    plan_dates_missing: planDatesMissing,
    ...(dateAuthority ? { trip_date_authority: dateAuthority } : {}),
    detail,
    trip_metadata_attached: true,
  });

  if (filledFields.length > 0) {
    host.logger.log(`[INTAKE] trip_hydration applied trip_id=${tid} filled=[${filledFields.join(', ')}]`);
  } else {
    host.logger.log(`[INTAKE] trip_hydration noop trip_id=${tid} sparse_db=${sparseDb}`);
  }
}
