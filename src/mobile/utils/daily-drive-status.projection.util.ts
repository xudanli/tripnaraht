/**
 * 今日自驾状态 — 纯投影（gate / 五维 / reminders）
 */

import type { ExecutionAlertsDto, ExecutionAlertDto } from '../dto/mobile-execution.types';
import {
  DAILY_DRIVE_DIMENSION_LABELS,
  DAILY_DRIVE_DIMENSION_ORDER,
  DAILY_DRIVE_STATUS_SCHEMA_ID,
  FUEL_LEVEL_LABELS_ZH,
  type DailyDriveConfirmPayload,
  type DailyDriveDimensionCode,
  type DailyDriveDimensionDto,
  type DailyDriveDimensionStatus,
  type DailyDriveGate,
  type DailyDriveReminderItemDto,
  type DailyDriveReminderLevel,
  type DailyDriveStatusDto,
  type DailyDriveFuelLevel,
} from '../dto/mobile-daily-drive.types';

export interface DailyDriveProjectionInput {
  localDate: string;
  timezone: string;
  confirmation?: {
    isConfirmed: boolean;
    confirmedAt?: string;
    confirmedByMemberId?: string;
    payload?: DailyDriveConfirmPayload;
  };
  /** 路况摘要 */
  road?: {
    alertTitle?: string;
    alertDetail?: string;
    severity?: 'high' | 'medium' | 'low' | 'ok';
    plowServiceBand?: string;
  };
  weather?: {
    tempC?: number;
    windMsMin?: number;
    windMsMax?: number;
    summaryZh?: string;
    icy?: boolean;
  };
  daylight?: {
    sunriseLabel?: string;
    sunsetLabel?: string;
    nightDriveLabelZh?: string;
    attention?: boolean;
  };
  fuel?: {
    nextStationKm?: number;
    /** 有真实走廊油站时为 true；缺省且无确认油量则不抬假绿 */
    stationResolved?: boolean;
  };
  schedule?: {
    nextHardWindowZh?: string;
    checkInZh?: string;
    attention?: boolean;
  };
  /** 建议出发 / 延误展示文案（可选，服务端已格式化） */
  suggestedDepartBeforeLabelZh?: string;
  estimatedDelayLabelZh?: string;
  suggestedDepartBeforeAt?: string;
  estimatedDelayMinutesMin?: number;
  estimatedDelayMinutesMax?: number;
  alerts?: ExecutionAlertsDto | null;
  includeReminders?: boolean;
  /** alerts 超时未纳入 → 禁止默认 CAN_DEPART 假绿 */
  remindersDeferred?: boolean;
  naraSuggestionZh?: string;
  evidenceUpdatedAt?: string;
  contextVersion?: number;
}

function statusLabelZh(status: DailyDriveDimensionStatus): string {
  switch (status) {
    case 'BLOCKED':
      return '阻断';
    case 'ATTENTION':
      return '注意';
    default:
      return 'OK';
  }
}

function gateLabelZh(gate: DailyDriveGate): string {
  switch (gate) {
    case 'BLOCKED':
      return '暂缓';
    case 'NEEDS_ATTENTION':
      return '需注意';
    default:
      return '可出发';
  }
}

function headlineForGate(gate: DailyDriveGate): string {
  switch (gate) {
    case 'BLOCKED':
      return '今天暂不建议按计划出发';
    case 'NEEDS_ATTENTION':
      return '今天可以出发，但需留意部分条件';
    default:
      return '今天可以按计划出发';
  }
}

export function formatFuelDetailZh(
  fuelLevel: DailyDriveFuelLevel | undefined,
  nextStationKm?: number,
): string {
  const levelLine =
    fuelLevel != null
      ? `当前油量：${FUEL_LEVEL_LABELS_ZH[fuelLevel]}`
      : '当前油量：待确认';
  const stationLine =
    nextStationKm != null && Number.isFinite(nextStationKm)
      ? `下一可靠油站：${Math.round(nextStationKm)} km`
      : '下一可靠油站：待评估';
  return `${levelLine}\n${stationLine}`;
}

function mapAlertToReminderLevel(
  alert: ExecutionAlertDto,
): DailyDriveReminderLevel | 'BLOCKING' | null {
  if (
    alert.level === 'STOP' ||
    alert.level === 'REPLAN_REQUIRED' ||
    alert.executionGate === 'STOP' ||
    alert.executionGate === 'REPLAN_REQUIRED' ||
    alert.requiresImmediateAttention
  ) {
    return 'BLOCKING';
  }
  if (alert.riskLevel === 'CRITICAL' || alert.riskLevel === 'HIGH') {
    return 'BLOCKING';
  }
  if (alert.riskLevel === 'LOW') return 'LOW';
  // AT_RISK / MEDIUM / 缺省 → MEDIUM
  return 'MEDIUM';
}

function inferDimensionFromAlert(alert: ExecutionAlertDto): DailyDriveDimensionCode | undefined {
  const blob = `${alert.riskType ?? ''} ${alert.riskKey ?? ''} ${alert.title} ${alert.reason}`.toLowerCase();
  if (/fuel|油|加油|petrol|gas/.test(blob)) return 'FUEL';
  if (/daylight|日照|日落|日出|night|夜间/.test(blob)) return 'DAYLIGHT';
  if (/weather|风|雪|冰|雨|storm|wind|temp|气温/.test(blob)) return 'WEATHER';
  if (/road|路|f-road|plow|封路|路面/.test(blob)) return 'ROAD';
  if (/schedule|日程|时间窗|集合|迟到|delay/.test(blob)) return 'SCHEDULE';
  return undefined;
}

function iconHintForDimension(code?: DailyDriveDimensionCode): string | undefined {
  switch (code) {
    case 'WEATHER':
      return 'wind';
    case 'DAYLIGHT':
      return 'sun.max';
    case 'FUEL':
      return 'fuelpump';
    case 'ROAD':
      return 'road.lanes';
    case 'SCHEDULE':
      return 'calendar';
    default:
      return undefined;
  }
}

export function projectRemindersFromAlerts(
  alerts: ExecutionAlertsDto | null | undefined,
): { items: DailyDriveReminderItemDto[]; hasBlocking: boolean } {
  if (!alerts) return { items: [], hasBlocking: false };

  const candidates: ExecutionAlertDto[] = [];
  if (alerts.primaryRisk) candidates.push(alerts.primaryRisk);
  for (const a of alerts.independentRisks ?? []) candidates.push(a);
  for (const a of alerts.alerts ?? []) {
    if (!candidates.some((c) => c.id === a.id)) candidates.push(a);
  }

  let hasBlocking = false;
  if (
    alerts.requiredAction === 'STOP' ||
    alerts.requiredAction === 'REPLAN' ||
    alerts.banner?.level === 'STOP' ||
    alerts.banner?.level === 'REPLAN_REQUIRED'
  ) {
    hasBlocking = true;
  }

  const items: DailyDriveReminderItemDto[] = [];
  for (const alert of candidates) {
    const mapped = mapAlertToReminderLevel(alert);
    if (mapped === 'BLOCKING') {
      hasBlocking = true;
      continue;
    }
    if (mapped == null) continue;
    const dimensionCode = inferDimensionFromAlert(alert);
    items.push({
      id: `rem_${alert.id}`,
      titleZh: alert.userNarrative?.whatHappened ?? alert.title,
      detailZh:
        alert.userNarrative?.impactOnTrip ?? alert.reason ?? alert.impact ?? '',
      level: mapped,
      levelLabelZh: mapped === 'MEDIUM' ? '中等' : '较低',
      iconHint: iconHintForDimension(dimensionCode),
      relatedRiskId: alert.riskId ?? alert.id,
      dimensionCode,
    });
  }

  return { items, hasBlocking };
}

export function buildConfirmSideEffectReminders(
  payload: DailyDriveConfirmPayload | undefined,
): DailyDriveReminderItemDto[] {
  if (!payload) return [];
  const items: DailyDriveReminderItemDto[] = [];
  if (payload.vehicleAbnormal) {
    items.push({
      id: 'rem_vehicle_abnormal',
      titleZh: '车辆存在异常',
      detailZh: payload.vehicleNoteZh?.trim() || '已确认车辆有异常，出发前请复检',
      level: 'MEDIUM',
      levelLabelZh: '中等',
      iconHint: 'wrench.and.screwdriver',
      dimensionCode: 'ROAD',
    });
  }
  if (!payload.prepCompleted) {
    items.push({
      id: 'rem_prep_incomplete',
      titleZh: '出发准备未完成',
      detailZh: payload.prepNoteZh?.trim() || '今日出发准备尚未完成，请补齐后再出发',
      level: 'MEDIUM',
      levelLabelZh: '中等',
      iconHint: 'checklist',
      dimensionCode: 'SCHEDULE',
    });
  }
  if (payload.fatigue === 'FATIGUED') {
    items.push({
      id: 'rem_fatigue',
      titleZh: '驾驶员疲劳',
      detailZh: '当前疲劳状态为「疲劳」，建议休息或更换驾驶员',
      level: 'MEDIUM',
      levelLabelZh: '中等',
      iconHint: 'bed.double',
      dimensionCode: 'SCHEDULE',
    });
  }
  if (!payload.departOnPlan) {
    items.push({
      id: 'rem_depart_off_plan',
      titleZh: '未按计划出发',
      detailZh: '今日出发与计划不一致，请留意后续时间窗',
      level: 'LOW',
      levelLabelZh: '较低',
      iconHint: 'clock',
      dimensionCode: 'SCHEDULE',
    });
  }
  return items;
}

function buildRoadDimension(
  input: DailyDriveProjectionInput,
  reminderIds: string[],
): DailyDriveDimensionDto {
  let status: DailyDriveDimensionStatus = 'OK';
  if (input.road?.severity === 'high') status = 'BLOCKED';
  else if (input.road?.severity === 'medium') status = 'ATTENTION';

  const plow =
    input.road?.plowServiceBand && input.road.plowServiceBand !== 'DAILY'
      ? ` · 清雪 ${input.road.plowServiceBand}`
      : '';
  const detailZh =
    input.road?.alertDetail?.trim() ||
    input.road?.alertTitle?.trim() ||
    `计划路段开放${plow || ' · 含碎石路'}`;

  return {
    code: 'ROAD',
    labelZh: DAILY_DRIVE_DIMENSION_LABELS.ROAD,
    status,
    statusLabelZh: statusLabelZh(status),
    detailZh,
    relatedReminderIds: reminderIds.length ? reminderIds : undefined,
  };
}

function buildWeatherDimension(
  input: DailyDriveProjectionInput,
  reminderIds: string[],
): DailyDriveDimensionDto {
  let status: DailyDriveDimensionStatus = 'OK';
  if (input.weather?.icy) status = 'ATTENTION';
  if (
    input.weather?.windMsMax != null &&
    input.weather.windMsMax >= 15
  ) {
    status = 'ATTENTION';
  }

  const temp =
    input.weather?.tempC != null ? `${Math.round(input.weather.tempC)}℃` : null;
  const wind =
    input.weather?.windMsMin != null && input.weather?.windMsMax != null
      ? `阵风 ${input.weather.windMsMin}-${input.weather.windMsMax} m/s`
      : null;
  const line1 = [temp, wind].filter(Boolean).join(' · ') || '天气条件待评估';
  const line2 =
    input.weather?.summaryZh?.trim() ||
    (input.weather?.icy ? '无暴雪，路面可能结冰' : '暂无显著天气影响');

  return {
    code: 'WEATHER',
    labelZh: DAILY_DRIVE_DIMENSION_LABELS.WEATHER,
    status,
    statusLabelZh: statusLabelZh(status),
    detailZh: `${line1}\n${line2}`,
    relatedReminderIds: reminderIds.length ? reminderIds : undefined,
  };
}

function buildDaylightDimension(
  input: DailyDriveProjectionInput,
  reminderIds: string[],
): DailyDriveDimensionDto {
  const status: DailyDriveDimensionStatus = input.daylight?.attention ? 'ATTENTION' : 'OK';
  const sunrise = input.daylight?.sunriseLabel ?? '—';
  const sunset = input.daylight?.sunsetLabel ?? '—';
  const night =
    input.daylight?.nightDriveLabelZh?.trim() || '夜间驾驶时长待评估';
  return {
    code: 'DAYLIGHT',
    labelZh: DAILY_DRIVE_DIMENSION_LABELS.DAYLIGHT,
    status,
    statusLabelZh: statusLabelZh(status),
    detailZh: `日出 ${sunrise} · 日落 ${sunset}\n${night}`,
    relatedReminderIds: reminderIds.length ? reminderIds : undefined,
  };
}

function buildFuelDimension(
  input: DailyDriveProjectionInput,
  reminderIds: string[],
): DailyDriveDimensionDto {
  const fuelLevel = input.confirmation?.payload?.fuelLevel;
  let status: DailyDriveDimensionStatus = 'OK';
  if (fuelLevel === 'QUARTER') status = 'ATTENTION';
  if (
    input.fuel?.nextStationKm != null &&
    input.fuel.nextStationKm > 80 &&
    (fuelLevel === 'QUARTER' || fuelLevel === 'HALF' || fuelLevel == null)
  ) {
    status = 'ATTENTION';
  }
  // 无真实油站距离且未确认油量 → 勿标 OK（避免假绿）
  if (
    input.fuel?.nextStationKm == null &&
    input.fuel?.stationResolved !== true &&
    fuelLevel == null
  ) {
    status = 'ATTENTION';
  }
  return {
    code: 'FUEL',
    labelZh: DAILY_DRIVE_DIMENSION_LABELS.FUEL,
    status,
    statusLabelZh: statusLabelZh(status),
    detailZh: formatFuelDetailZh(fuelLevel, input.fuel?.nextStationKm),
    relatedReminderIds: reminderIds.length ? reminderIds : undefined,
  };
}

function buildScheduleDimension(
  input: DailyDriveProjectionInput,
  reminderIds: string[],
  confirmPayload?: DailyDriveConfirmPayload,
): DailyDriveDimensionDto {
  let status: DailyDriveDimensionStatus = input.schedule?.attention ? 'ATTENTION' : 'OK';
  if (confirmPayload && (!confirmPayload.prepCompleted || !confirmPayload.departOnPlan)) {
    status = 'ATTENTION';
  }
  if (confirmPayload?.fatigue === 'FATIGUED') status = 'ATTENTION';

  const hard =
    input.schedule?.nextHardWindowZh?.trim() || '下一个硬时间窗：暂无';
  const checkIn = input.schedule?.checkInZh?.trim() || '住宿入住：待确认';
  return {
    code: 'SCHEDULE',
    labelZh: DAILY_DRIVE_DIMENSION_LABELS.SCHEDULE,
    status,
    statusLabelZh: statusLabelZh(status),
    detailZh: `${hard}\n${checkIn}`,
    relatedReminderIds: reminderIds.length ? reminderIds : undefined,
  };
}

function attachReminderIds(
  dimensions: DailyDriveDimensionDto[],
  reminders: DailyDriveReminderItemDto[],
): DailyDriveDimensionDto[] {
  return dimensions.map((d) => {
    const ids = reminders
      .filter((r) => r.dimensionCode === d.code)
      .map((r) => r.id);
    return {
      ...d,
      relatedReminderIds: ids.length ? ids : d.relatedReminderIds,
    };
  });
}

export function resolveDailyDriveGate(input: {
  dimensions: DailyDriveDimensionDto[];
  reminders: DailyDriveReminderItemDto[];
  hasBlockingAlert: boolean;
}): DailyDriveGate {
  if (
    input.hasBlockingAlert ||
    input.dimensions.some((d) => d.status === 'BLOCKED')
  ) {
    return 'BLOCKED';
  }
  if (
    input.dimensions.some((d) => d.status === 'ATTENTION') ||
    input.reminders.some((r) => r.level === 'MEDIUM')
  ) {
    return 'NEEDS_ATTENTION';
  }
  return 'CAN_DEPART';
}

export function projectDailyDriveStatus(
  input: DailyDriveProjectionInput,
): DailyDriveStatusDto {
  const includeReminders = input.includeReminders !== false;
  const fromAlerts = projectRemindersFromAlerts(input.alerts);
  const fromConfirm = buildConfirmSideEffectReminders(input.confirmation?.payload);
  const reminderItems = includeReminders
    ? [...fromAlerts.items, ...fromConfirm]
    : [];

  let dimensions: DailyDriveDimensionDto[] = DAILY_DRIVE_DIMENSION_ORDER.map((code) => {
    switch (code) {
      case 'ROAD':
        return buildRoadDimension(input, []);
      case 'WEATHER':
        return buildWeatherDimension(input, []);
      case 'DAYLIGHT':
        return buildDaylightDimension(input, []);
      case 'FUEL':
        return buildFuelDimension(input, []);
      case 'SCHEDULE':
        return buildScheduleDimension(input, [], input.confirmation?.payload);
      default:
        return {
          code,
          labelZh: DAILY_DRIVE_DIMENSION_LABELS[code],
          status: 'OK' as const,
          statusLabelZh: 'OK',
          detailZh: '—',
        };
    }
  });

  // 车辆异常抬 ROAD 为 ATTENTION
  if (input.confirmation?.payload?.vehicleAbnormal) {
    dimensions = dimensions.map((d) =>
      d.code === 'ROAD' && d.status === 'OK'
        ? { ...d, status: 'ATTENTION', statusLabelZh: statusLabelZh('ATTENTION') }
        : d,
    );
  }

  dimensions = attachReminderIds(dimensions, reminderItems);
  let gate = resolveDailyDriveGate({
    dimensions,
    reminders: reminderItems,
    hasBlockingAlert: fromAlerts.hasBlocking,
  });

  // alerts 未纳入时不得默认「可出发」假绿
  if (input.remindersDeferred && gate === 'CAN_DEPART') {
    gate = 'NEEDS_ATTENTION';
  }

  const nara =
    input.naraSuggestionZh?.trim() ||
    input.alerts?.aiRecommendation?.detail ||
    input.alerts?.aiRecommendation?.headline ||
    undefined;

  return {
    schemaId: DAILY_DRIVE_STATUS_SCHEMA_ID,
    localDate: input.localDate,
    timezone: input.timezone,
    gate,
    gateLabelZh: gateLabelZh(gate),
    headline: headlineForGate(gate),
    suggestedDepartBeforeLabelZh: input.suggestedDepartBeforeLabelZh,
    estimatedDelayLabelZh: input.estimatedDelayLabelZh,
    suggestedDepartBeforeAt: input.suggestedDepartBeforeAt,
    estimatedDelayMinutesMin: input.estimatedDelayMinutesMin,
    estimatedDelayMinutesMax: input.estimatedDelayMinutesMax,
    confirmation: {
      isConfirmed: input.confirmation?.isConfirmed === true,
      confirmedAt: input.confirmation?.confirmedAt,
      confirmedByMemberId: input.confirmation?.confirmedByMemberId,
    },
    dimensions,
    reminders: {
      items: reminderItems,
      naraSuggestionZh: nara || undefined,
    },
    entry: {
      subtitleZh: '路况 · 天气 · 日照 · 燃油 · 日程',
    },
    evidence: {
      updatedAt: input.evidenceUpdatedAt ?? new Date().toISOString(),
      ...(input.remindersDeferred
        ? { confidence: 0.6, remindersDeferred: true }
        : {}),
    },
    contextVersion: input.contextVersion,
  };
}

export function defaultConfirmPayload(driverMemberId: string): DailyDriveConfirmPayload {
  return {
    fuelLevel: 'THREE_QUARTERS',
    departOnPlan: true,
    driverMemberId,
    fatigue: 'GOOD',
    vehicleAbnormal: false,
    prepCompleted: true,
  };
}
