/**
 * 执行总览 Dashboard — 纯投影（结论 + 展示文案）
 * 不拉 IO；服务端裁定四态 / 生命周期 / 出发建议 / 时间余量。
 */

import { formatClockLabel } from '../../common/utils/format-clock-label.util';
import type { DailyDriveConfirmPayload, DailyDriveFuelLevel, DailyDriveGate, DailyDriveStatusDto } from '../dto/mobile-daily-drive.types';
import { FUEL_LEVEL_LABELS_ZH } from '../dto/mobile-daily-drive.types';
import {
  OVERVIEW_DASHBOARD_SCHEMA_ID,
  type OverviewCtaPhase,
  type OverviewDashboardDto,
  type OverviewDepartureKind,
  type OverviewDepartureSuggestionDto,
  type OverviewDriveAdvisoryDto,
  type OverviewExceptionDto,
  type OverviewNextDestinationDto,
  type OverviewNowDto,
  type OverviewNowKind,
  type OverviewOverallStatusCode,
  type OverviewOverallStatusDto,
  type OverviewPlanRealityDto,
  type OverviewSelfDriveDto,
  type OverviewSelfDriveKernelShadowDto,
  type OverviewSelfDriveLifecycle,
  type OverviewTeamReadinessDto,
  type OverviewTimeMarginSeverity,
  type OverviewVehicleDto,
} from '../dto/mobile-overview-dashboard.types';
import { fuelLevelToFraction } from './daily-drive-dimension-detail.projection.util';

const FUEL_FULL_RANGE_KM = 560;

/** 与 next 同形；表示「当前停留点」（AT_STOP），与行驶中的 next 解耦 */
export type OverviewStopEnrichment = {
  activityId?: string;
  titleZh?: string;
  placeTypeZh?: string;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  distanceKm?: number;
  driveMinutes?: number;
  etaLocalHHmm?: string;
  /** 若已观测到实际到达本地时刻 HH:mm */
  actualArrivalLocalHHmm?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  accessNoteZh?: string;
  statusNoteZh?: string;
};

export interface OverviewDashboardProjectionInput {
  lite: boolean;
  contextVersion: number;
  serverTime: string;
  trafficUpdatedAt?: string;
  /** daily-drive gate + 建议出发 + 五维摘要 */
  dailyDrive?: Pick<
    DailyDriveStatusDto,
    | 'gate'
    | 'headline'
    | 'suggestedDepartBeforeLabelZh'
    | 'suggestedDepartBeforeAt'
    | 'estimatedDelayLabelZh'
    | 'confirmation'
    | 'dimensions'
    | 'evidence'
  > | null;
  confirmPayload?: DailyDriveConfirmPayload | null;
  driverOptions?: Array<{ memberId: string; displayName: string; isPrimaryDriver?: boolean }>;
  /** 旧 overview 轻量字段 */
  currentActivity?: {
    title?: string;
    locationName?: string;
    meetingTime?: string;
    estimatedArrival?: string;
    remainingTime?: string;
    progress?: number;
    imageUrl?: string | null;
    currentLocationName?: string | null;
  } | null;
  pendingAdjustmentCount?: number;
  alertCount?: number;
  primaryRiskId?: string;
  /** 下一目的地补充（未到达的下一站） */
  next?: OverviewStopEnrichment | null;
  /**
   * 当前停留点（inProgress / ARRIVED）。
   * 与 next 分离：避免「在店」被投影成 nextDestination。
   */
  nowStop?: OverviewStopEnrichment | null;
  /** 今晚住宿 */
  lodging?: {
    nameZh: string;
    detailZh?: string;
    statusZh?: string;
    imageUrl?: string;
  } | null;
  /** 团队就绪输入（不要 members[] 出参） */
  team?: {
    totalCount: number;
    readyMemberIds?: string[];
    attentionNamesZh?: string[];
    blocked?: boolean;
  } | null;
  /** 自驾时长（P1 drive-session；缺省不编造） */
  driveSession?: {
    continuousDriveMinutes?: number;
    todayDrivenMinutes?: number;
    todayRemainingDriveMinutes?: number;
    temporaryStop?: boolean;
    arrivedAtDestination?: boolean;
    dayEnded?: boolean;
    /** 权威 phase 优先于 progress 启发式 */
    phase?: OverviewSelfDriveLifecycle;
  } | null;
  activeRunbookId?: string;
  offlineMapAvailable?: boolean;
  /** full 才投影到 vehicle */
  rentalEmergencyPhone?: string;
  vehicleTypeZh?: string;
  continuousDriveWarningZh?: string;
  /** K4：Self-Drive Kernel 影子（不参与 overallStatus 抬升） */
  advisories?: OverviewDriveAdvisoryDto[];
  selfDriveKernel?: OverviewSelfDriveKernelShadowDto;
}

function fuelPercent(level?: DailyDriveFuelLevel): number | undefined {
  if (!level) return undefined;
  return Math.round(fuelLevelToFraction(level) * 100);
}

function parseHHmmToMinutes(value?: string | null): number | undefined {
  if (!value) return undefined;
  const plain = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (plain) return Number(plain[1]) * 60 + Number(plain[2]);
  const clock = formatClockLabel(value, { emptyLabel: '' });
  if (!clock || clock === '待确认') return undefined;
  const m = /^(\d{2}):(\d{2})$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

function formatSignedMarginZh(minutes: number): string {
  if (minutes > 0) return `提前 ${minutes} 分钟`;
  if (minutes < 0) return `迟到 ${Math.abs(minutes)} 分钟`;
  return '刚好准时';
}

function marginSeverity(minutes: number): OverviewTimeMarginSeverity {
  if (minutes < 0) return 'LATE';
  if (minutes <= 10) return 'TIGHT';
  return 'OK';
}

/**
 * 安静原则：无 Impact 时不抬升 NEEDS_ATTENTION。
 * gate=NEEDS_ATTENTION / 软提醒 alone 不够；须 hasImpact（迟到 / 待调整 / 立即风险 / 阻断）。
 */
function mapOverallStatus(input: {
  gate?: DailyDriveGate;
  pendingAdjustmentCount: number;
  alertCount: number;
  hasBlockingAlert: boolean;
  hasImpact: boolean;
}): OverviewOverallStatusDto {
  const pending = input.pendingAdjustmentCount;
  let code: OverviewOverallStatusCode;
  if (input.gate === 'BLOCKED' || input.hasBlockingAlert) {
    code = 'PAUSE_EXECUTION';
  } else if (pending > 0) {
    code = 'SUGGEST_ADJUST';
  } else if (input.hasImpact) {
    // 迟到 / 立即风险等；gate=NEEDS_ATTENTION  alone 不会置 hasImpact
    code = 'NEEDS_ATTENTION';
  } else {
    code = 'ON_PLAN';
  }

  const headlines: Record<OverviewOverallStatusCode, string> = {
    ON_PLAN: '今天按计划进行',
    NEEDS_ATTENTION: '今天需留意部分条件',
    SUGGEST_ADJUST: '建议调整今天安排',
    PAUSE_EXECUTION: '建议暂停执行',
  };

  const details: Record<OverviewOverallStatusCode, string> = {
    ON_PLAN: '当前无阻断风险',
    NEEDS_ATTENTION: '可继续执行，请关注提醒项',
    SUGGEST_ADJUST: pending > 0 ? `${pending} 项待调整` : '建议微调后再出发',
    PAUSE_EXECUTION: '存在阻断条件，请先处理',
  };

  return {
    code,
    headlineZh: headlines[code],
    detailZh: details[code],
    pendingAdjustmentCount: pending > 0 ? pending : undefined,
    hasImpact: input.hasImpact || code === 'PAUSE_EXECUTION' || code === 'SUGGEST_ADJUST',
  };
}

function mapNowKind(lifecycle: OverviewSelfDriveLifecycle): OverviewNowKind {
  switch (lifecycle) {
    case 'BLOCKED':
      return 'BLOCKED';
    case 'DAY_ENDED':
      return 'DAY_ENDED';
    case 'DRIVING':
    case 'TEMPORARY_STOP':
      return 'DRIVING';
    case 'ARRIVED':
      return 'AT_STOP';
    case 'PREPARING':
      return 'PREPARING';
    default:
      return 'NOT_STARTED';
  }
}

function projectNow(input: {
  lifecycle: OverviewSelfDriveLifecycle;
  nowStop?: OverviewStopEnrichment | null;
  next?: OverviewStopEnrichment | null;
  currentActivity?: OverviewDashboardProjectionInput['currentActivity'];
}): OverviewNowDto {
  const lifecycleKind = mapNowKind(input.lifecycle);

  if (lifecycleKind === 'BLOCKED') {
    return { kind: 'BLOCKED', titleZh: '今日执行暂缓', atDestination: false };
  }
  if (lifecycleKind === 'DAY_ENDED') {
    return { kind: 'DAY_ENDED', titleZh: '今日行程已结束', atDestination: false };
  }

  // 驾驶态优先：即使有 nowStop 残留，也以「在开」为准
  if (lifecycleKind === 'DRIVING') {
    const dest =
      input.next?.titleZh?.trim() ||
      input.currentActivity?.title?.trim() ||
      '下一站';
    return {
      kind: 'DRIVING',
      activityId: input.next?.activityId,
      titleZh: `前往 ${dest}`,
      detailZh: input.next?.etaLocalHHmm
        ? `预计 ${input.next.etaLocalHHmm} 抵达`
        : undefined,
      atDestination: false,
    };
  }

  // 有停留点 enrichment → 显式 AT_STOP（勿让客户端用 next 反推）
  if (input.nowStop || lifecycleKind === 'AT_STOP') {
    const title =
      input.nowStop?.titleZh?.trim() ||
      input.currentActivity?.locationName?.trim() ||
      input.currentActivity?.title?.trim() ||
      '当前位置';
    return {
      kind: 'AT_STOP',
      activityId: input.nowStop?.activityId,
      titleZh: title,
      detailZh: input.nowStop?.placeTypeZh,
      atDestination: true,
    };
  }

  if (lifecycleKind === 'PREPARING') {
    return {
      kind: 'PREPARING',
      titleZh: '出发准备中',
      detailZh: input.next?.titleZh
        ? `下一站 ${input.next.titleZh}`
        : undefined,
      atDestination: false,
    };
  }

  return {
    kind: 'NOT_STARTED',
    titleZh: input.next?.titleZh
      ? `待出发 · ${input.next.titleZh}`
      : '今日尚未出发',
    detailZh: input.next?.timeWindowStart
      ? `计划窗口 ${formatClockLabel(input.next.timeWindowStart, { emptyLabel: '' })}`
      : undefined,
    atDestination: false,
  };
}

function projectPlanReality(input: {
  next?: OverviewStopEnrichment | null;
  nowStop?: OverviewStopEnrichment | null;
  nextDestination: OverviewNextDestinationDto;
  pendingAdjustmentCount: number;
  alertCount: number;
  gate?: DailyDriveGate;
  hasBlockingAlert: boolean;
  activeRunbookId?: string;
  estimatedDelayLabelZh?: string;
}): OverviewPlanRealityDto {
  const plannedRaw =
    input.next?.timeWindowStart ??
    input.nowStop?.timeWindowStart ??
    undefined;
  const plannedArrivalLocalHHmm = plannedRaw
    ? formatClockLabel(plannedRaw, { emptyLabel: '' }) || undefined
    : input.nextDestination.timeWindowZh?.split('–')[0];

  const actual =
    input.next?.actualArrivalLocalHHmm ||
    input.nowStop?.actualArrivalLocalHHmm;
  const eta =
    input.next?.etaLocalHHmm ||
    (input.nextDestination.etaZh
      ? input.nextDestination.etaZh.replace(/^预计\s*/, '').replace(/\s*到达$/, '')
      : undefined);

  let realitySource: OverviewPlanRealityDto['realitySource'] = 'PLANNED_ONLY';
  let actualOrEtaLocalHHmm: string | undefined;
  if (actual) {
    realitySource = 'ACTUAL';
    actualOrEtaLocalHHmm = actual;
  } else if (eta) {
    realitySource = 'ETA';
    actualOrEtaLocalHHmm = eta;
  }

  const deviationMinutes = input.nextDestination.timeMarginMinutes;
  const deviationZh = input.nextDestination.timeMarginZh;
  const severity = input.nextDestination.timeMarginSeverity;

  const late = severity === 'LATE';
  const pending = input.pendingAdjustmentCount > 0;
  const immediateRisk = input.alertCount > 0;
  const blocked = input.hasBlockingAlert || input.gate === 'BLOCKED';

  const hasImpact = blocked || pending || late || immediateRisk;

  let impactReasonZh: string | undefined;
  if (blocked) impactReasonZh = '存在阻断条件，需先处理再执行';
  else if (pending) impactReasonZh = `${input.pendingAdjustmentCount} 项待调整影响今日安排`;
  else if (late) impactReasonZh = deviationZh ?? '预计晚于计划窗口';
  else if (immediateRisk) impactReasonZh = '存在需立即关注的风险';

  let recommendedAdjustment: OverviewPlanRealityDto['recommendedAdjustment'];
  if (hasImpact) {
    if (blocked && input.activeRunbookId) {
      recommendedAdjustment = {
        kind: 'FOLLOW_RUNBOOK',
        titleZh: '按处置指引处理',
        detailZh: '打开当前 Runbook',
      };
    } else if (pending) {
      recommendedAdjustment = {
        kind: 'OPEN_ADJUSTMENT_QUEUE',
        titleZh: '查看待调整项',
        detailZh: `${input.pendingAdjustmentCount} 项待你确认`,
      };
    } else if (late) {
      recommendedAdjustment = {
        kind: 'SHORTEN_STAY',
        titleZh: '建议压缩停留或改下一站',
        detailZh: input.estimatedDelayLabelZh ?? deviationZh,
      };
    } else if (input.gate === 'NEEDS_ATTENTION') {
      recommendedAdjustment = {
        kind: 'DELAY_DEPART',
        titleZh: '建议推迟出发',
        detailZh: input.estimatedDelayLabelZh,
      };
    }
  }

  return {
    plannedArrivalLocalHHmm: plannedArrivalLocalHHmm || undefined,
    actualOrEtaLocalHHmm,
    realitySource,
    deviationMinutes,
    deviationZh,
    hasImpact,
    impactReasonZh,
    recommendedAdjustment,
  };
}

function projectException(input: {
  planReality: OverviewPlanRealityDto;
  overallCode: OverviewOverallStatusCode;
  primaryRiskId?: string;
  pendingAdjustmentCount: number;
}): OverviewExceptionDto | undefined {
  if (!input.planReality.hasImpact) return undefined;

  if (input.overallCode === 'PAUSE_EXECUTION') {
    return {
      code: 'BLOCKED',
      titleZh: '建议暂停执行',
      detailZh: input.planReality.impactReasonZh,
      primaryRiskId: input.primaryRiskId,
    };
  }
  if (input.overallCode === 'SUGGEST_ADJUST' || input.pendingAdjustmentCount > 0) {
    return {
      code: 'NEEDS_ADJUSTMENT',
      titleZh: '建议调整今天安排',
      detailZh: input.planReality.impactReasonZh,
      primaryRiskId: input.primaryRiskId,
    };
  }
  if (input.planReality.deviationMinutes != null && input.planReality.deviationMinutes < 0) {
    return {
      code: 'LATE',
      titleZh: '进度落后于计划',
      detailZh: input.planReality.deviationZh,
      primaryRiskId: input.primaryRiskId,
    };
  }
  return {
    code: 'RISK',
    titleZh: '存在需关注的风险',
    detailZh: input.planReality.impactReasonZh,
    primaryRiskId: input.primaryRiskId,
  };
}

function mapLifecycle(input: {
  gate?: DailyDriveGate;
  isConfirmed: boolean;
  progress?: number;
  driveSession?: OverviewDashboardProjectionInput['driveSession'];
}): OverviewSelfDriveLifecycle {
  if (input.gate === 'BLOCKED') return 'BLOCKED';
  if (input.driveSession?.phase) return input.driveSession.phase;
  if (input.driveSession?.dayEnded) return 'DAY_ENDED';
  if (input.driveSession?.arrivedAtDestination) return 'ARRIVED';
  if (input.driveSession?.temporaryStop) return 'TEMPORARY_STOP';
  if ((input.progress ?? 0) > 0.05 && input.isConfirmed) return 'DRIVING';
  if (input.isConfirmed) return 'PREPARING';
  return 'NOT_DEPARTED';
}

function mapCtaPhase(lifecycle: OverviewSelfDriveLifecycle): OverviewCtaPhase {
  switch (lifecycle) {
    case 'DRIVING':
    case 'TEMPORARY_STOP':
      return 'DRIVING';
    case 'ARRIVED':
      return 'AT_DESTINATION';
    case 'DAY_ENDED':
      return 'ACTIVITY_ENDED';
    default:
      return 'NOT_DEPARTED';
  }
}

function projectDepartureSuggestion(input: {
  lifecycle: OverviewSelfDriveLifecycle;
  gate?: DailyDriveGate;
  suggestedLabelZh?: string;
  suggestedAt?: string;
  estimatedDelayLabelZh?: string;
}): OverviewDepartureSuggestionDto | undefined {
  if (
    input.lifecycle === 'DRIVING' ||
    input.lifecycle === 'TEMPORARY_STOP' ||
    input.lifecycle === 'ARRIVED' ||
    input.lifecycle === 'DAY_ENDED'
  ) {
    return undefined;
  }

  let kind: OverviewDepartureKind;
  if (input.gate === 'BLOCKED') {
    kind = 'DO_NOT_DEPART';
  } else if (input.gate === 'NEEDS_ATTENTION') {
    kind = 'DELAY_DEPART';
  } else if (input.suggestedLabelZh) {
    kind = 'DEPART_WITHIN';
  } else {
    kind = 'CAN_DEPART_NOW';
  }

  const departBeforeLocalTime = input.suggestedAt
    ? formatClockLabel(input.suggestedAt, { emptyLabel: '' }) || undefined
    : undefined;

  const titleZh =
    kind === 'DO_NOT_DEPART'
      ? '暂不建议出发'
      : kind === 'DELAY_DEPART'
        ? input.suggestedLabelZh ?? '建议推迟出发'
        : kind === 'CAN_DEPART_NOW'
          ? '现在可以出发'
          : input.suggestedLabelZh ?? '建议按时出发';

  return {
    kind,
    titleZh,
    detailZh:
      input.estimatedDelayLabelZh ??
      (kind === 'DEPART_WITHIN' || kind === 'DELAY_DEPART'
        ? '已包含停车与步行缓冲'
        : undefined),
    departBeforeLocalTime:
      departBeforeLocalTime && /^\d{2}:\d{2}$/.test(departBeforeLocalTime)
        ? departBeforeLocalTime
        : undefined,
  };
}

function projectVehicle(input: {
  confirm?: DailyDriveConfirmPayload | null;
  fuelDimDetailZh?: string;
  fuelDimStatus?: string;
  nextFuelKm?: number;
  roadDimStatus?: string;
  vehicleTypeZh?: string;
  rentalEmergencyPhone?: string;
  continuousDriveWarningZh?: string;
  lite?: boolean;
}): OverviewVehicleDto {
  const fuelLevel = input.confirm?.fuelLevel;
  const percent = fuelPercent(fuelLevel);
  const rangeKm =
    fuelLevel != null
      ? Math.round(fuelLevelToFraction(fuelLevel) * FUEL_FULL_RANGE_KM)
      : undefined;
  const abnormal = input.confirm?.vehicleAbnormal === true;
  const fuelBlocked = input.fuelDimStatus === 'BLOCKED';
  const fuelAttention = input.fuelDimStatus === 'ATTENTION';
  const roadBlocked = input.roadDimStatus === 'BLOCKED';
  const roadAttention = input.roadDimStatus === 'ATTENTION';
  const isNormal = !abnormal && !fuelBlocked && !roadBlocked;

  const fuelPart =
    percent != null
      ? `油量约 ${percent}%`
      : fuelLevel
        ? `油量 ${FUEL_LEVEL_LABELS_ZH[fuelLevel]}`
        : '油量待确认';
  const rangePart = rangeKm != null ? `续航约 ${rangeKm} km` : undefined;
  const summaryLineZh = [
    isNormal ? '车辆状态正常' : '车辆需关注',
    fuelPart,
    rangePart,
  ]
    .filter(Boolean)
    .join(' · ');

  const nextFuelKm = input.nextFuelKm;
  const nextFuelLabelZh =
    nextFuelKm != null && Number.isFinite(nextFuelKm)
      ? `下一可靠油站约 ${Math.round(nextFuelKm)} km`
      : undefined;

  let alertTitleZh: string | undefined;
  let alertDetailZh: string | undefined;
  if (abnormal) {
    alertTitleZh = '车辆异常已上报';
    alertDetailZh = input.confirm?.vehicleNoteZh?.trim() || '请检查车辆后再出发';
  } else if (fuelBlocked || (nextFuelKm != null && rangeKm != null && rangeKm < nextFuelKm)) {
    alertTitleZh = '建议尽快加油';
    alertDetailZh =
      nextFuelLabelZh ?? input.fuelDimDetailZh?.split('\n')[1] ?? '后续路段加油点较少';
  } else if (fuelAttention) {
    alertTitleZh = '油量需关注';
    alertDetailZh = nextFuelLabelZh ?? input.fuelDimDetailZh;
  }

  let roadFitZh: string | undefined;
  if (roadBlocked) roadFitZh = '道路不适配 · 存在禁行或封闭风险';
  else if (roadAttention) roadFitZh = '道路需关注';
  else if (isNormal) roadFitZh = '道路适配正常';

  return {
    isNormal,
    summaryLineZh,
    fuelPercent: percent,
    rangeKm,
    nextFuelKm: nextFuelKm != null ? Math.round(nextFuelKm) : undefined,
    nextFuelLabelZh,
    vehicleTypeZh: input.vehicleTypeZh,
    roadFitZh,
    alertTitleZh,
    alertDetailZh,
    continuousDriveWarningZh: input.continuousDriveWarningZh,
    rentalEmergencyPhone: input.lite ? undefined : input.rentalEmergencyPhone,
  };
}

function projectTeam(input: OverviewDashboardProjectionInput['team']): OverviewTeamReadinessDto {
  const total = Math.max(0, input?.totalCount ?? 0);
  const readyIds = input?.readyMemberIds ?? [];
  const readyCount = Math.min(total, readyIds.length || (input?.blocked ? 0 : total));
  const attention = input?.attentionNamesZh?.filter(Boolean) ?? [];

  let kind: OverviewTeamReadinessDto['kind'] = 'READY';
  if (input?.blocked || total === 0) {
    kind = total === 0 ? 'PARTIAL' : 'BLOCKED';
  } else if (readyCount < total || attention.length > 0) {
    kind = 'PARTIAL';
  }

  return {
    kind,
    summaryLineZh: `团队 ${total} 人 · ${readyCount} 人已准备好`,
    attentionLineZh:
      attention.length > 0
        ? `${attention.slice(0, 2).join('、')}${attention.length > 2 ? ' 等' : ''}尚未确认`
        : undefined,
    readyCount,
    totalCount: total,
  };
}

function projectNextDestination(input: {
  lifecycle: OverviewSelfDriveLifecycle;
  currentActivity?: OverviewDashboardProjectionInput['currentActivity'];
  next?: OverviewDashboardProjectionInput['next'];
  lite: boolean;
}): OverviewNextDestinationDto {
  const titleZh =
    input.next?.titleZh?.trim() ||
    input.currentActivity?.title?.trim() ||
    input.currentActivity?.locationName?.trim() ||
    '下一站';

  const start =
    input.next?.timeWindowStart != null
      ? formatClockLabel(input.next.timeWindowStart, { emptyLabel: '' })
      : undefined;
  const end =
    input.next?.timeWindowEnd != null
      ? formatClockLabel(input.next.timeWindowEnd, { emptyLabel: '' })
      : undefined;
  const timeWindowZh =
    start && end ? `${start}–${end}` : start ? start : undefined;

  const etaRaw =
    input.next?.etaLocalHHmm ||
    (input.currentActivity?.estimatedArrival &&
    input.currentActivity.estimatedArrival !== '--:--'
      ? input.currentActivity.estimatedArrival
      : undefined);
  const etaZh = etaRaw ? `预计 ${etaRaw} 到达` : undefined;

  const distanceKm = input.next?.distanceKm;
  const driveMinutes = input.next?.driveMinutes;
  let distanceDurationZh: string | undefined;
  if (distanceKm != null && driveMinutes != null) {
    distanceDurationZh = `${Math.round(distanceKm)} km · 驾驶约 ${Math.round(driveMinutes)} 分钟`;
  } else if (distanceKm != null) {
    distanceDurationZh = `${Math.round(distanceKm)} km`;
  } else if (driveMinutes != null) {
    distanceDurationZh = `驾驶约 ${Math.round(driveMinutes)} 分钟`;
  } else if (input.currentActivity?.remainingTime && input.currentActivity.remainingTime !== '—') {
    distanceDurationZh = input.currentActivity.remainingTime;
  }

  const windowStartMin = parseHHmmToMinutes(start || input.next?.timeWindowStart);
  const etaMin = parseHHmmToMinutes(etaRaw);
  let timeMarginMinutes: number | undefined;
  let timeMarginZh: string | undefined;
  let timeMarginSeverity: OverviewTimeMarginSeverity | undefined;
  if (windowStartMin != null && etaMin != null) {
    timeMarginMinutes = windowStartMin - etaMin;
    timeMarginZh = formatSignedMarginZh(timeMarginMinutes);
    timeMarginSeverity = marginSeverity(timeMarginMinutes);
  }

  return {
    activityId: input.next?.activityId,
    titleZh,
    placeTypeZh: input.next?.placeTypeZh,
    timeWindowZh,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : undefined,
    driveMinutes: driveMinutes != null ? Math.round(driveMinutes) : undefined,
    distanceDurationZh,
    etaZh,
    timeMarginMinutes,
    timeMarginZh,
    timeMarginSeverity,
    accessNoteZh: input.next?.accessNoteZh,
    statusNoteZh: input.next?.statusNoteZh,
    latitude: input.lite ? undefined : input.next?.latitude,
    longitude: input.lite ? undefined : input.next?.longitude,
    imageUrl: input.lite
      ? undefined
      : input.next?.imageUrl ?? input.currentActivity?.imageUrl ?? undefined,
    ctaPhase: mapCtaPhase(input.lifecycle),
  };
}

function projectSelfDrive(input: {
  lifecycle: OverviewSelfDriveLifecycle;
  overallCode: OverviewOverallStatusCode;
  confirm?: DailyDriveConfirmPayload | null;
  driverOptions?: OverviewDashboardProjectionInput['driverOptions'];
  driveSession?: OverviewDashboardProjectionInput['driveSession'];
  lodgingEtaZh?: string;
  nextTitleZh?: string;
}): OverviewSelfDriveDto {
  const driverId = input.confirm?.driverMemberId;
  const driverOpt = input.driverOptions?.find((d) => d.memberId === driverId);
  const driver =
    driverId != null
      ? {
          memberId: driverId,
          displayName: driverOpt?.displayName ?? '驾驶员',
        }
      : input.driverOptions?.find((d) => d.isPrimaryDriver)
        ? {
            memberId: input.driverOptions.find((d) => d.isPrimaryDriver)!.memberId,
            displayName: input.driverOptions.find((d) => d.isPrimaryDriver)!.displayName,
          }
        : undefined;

  const planBadgeZh =
    input.overallCode === 'ON_PLAN'
      ? '按计划'
      : input.overallCode === 'PAUSE_EXECUTION'
        ? '暂缓'
        : '需关注';

  const nightEtaZh = input.lodgingEtaZh
    ? `预计 ${input.lodgingEtaZh} 抵达${input.nextTitleZh ? ` ${input.nextTitleZh}` : ''}`
    : undefined;

  const continuous = input.driveSession?.continuousDriveMinutes;
  const todayDriven = input.driveSession?.todayDrivenMinutes;
  const todayRemaining = input.driveSession?.todayRemainingDriveMinutes;

  return {
    lifecycle: input.lifecycle,
    driver,
    continuousDriveMinutes: continuous,
    todayDrivenMinutes: todayDriven,
    todayRemainingDriveMinutes: todayRemaining,
    planBadgeZh,
    nightEtaZh,
    driverContextLineZh: driver ? `当前驾驶员 ${driver.displayName}` : '驾驶员待确认',
    dailyDriveLineZh:
      continuous != null
        ? `连续驾驶 ${continuous} 分钟`
        : todayDriven != null
          ? `今日已驾驶 ${todayDriven} 分钟`
          : '驾驶时长待同步',
    planContextLineZh: planBadgeZh,
  };
}

/**
 * 将多源读模型投影为总览首屏可渲染结论。
 * P1：附带 Execution Projection（now / exception / planReality）。
 */
export function projectOverviewDashboard(
  input: OverviewDashboardProjectionInput,
): OverviewDashboardDto {
  const gate = input.dailyDrive?.gate;
  const isConfirmed = !!input.dailyDrive?.confirmation?.isConfirmed;
  const fuelDim = input.dailyDrive?.dimensions?.find((d) => d.code === 'FUEL');
  const roadDim = input.dailyDrive?.dimensions?.find((d) => d.code === 'ROAD');
  const nextFuelMatch = fuelDim?.detailZh?.match(/(\d+)\s*km/i);
  const nextFuelKmFromDim = nextFuelMatch ? Number(nextFuelMatch[1]) : undefined;

  // 与 daily-drive gate 同源：BLOCKED gate 即暂停，不依赖 alerts 是否到位
  const hasBlockingAlert = gate === 'BLOCKED';
  const pendingAdjustmentCount = input.pendingAdjustmentCount ?? 0;
  const alertCount = input.alertCount ?? 0;

  const lifecycle = mapLifecycle({
    gate,
    isConfirmed,
    progress: input.currentActivity?.progress,
    driveSession: input.driveSession,
  });

  const nextDestination = projectNextDestination({
    lifecycle,
    currentActivity: input.currentActivity,
    next: input.next,
    lite: input.lite,
  });

  const planReality = projectPlanReality({
    next: input.next,
    nowStop: input.nowStop,
    nextDestination,
    pendingAdjustmentCount,
    alertCount,
    gate,
    hasBlockingAlert,
    activeRunbookId: input.activeRunbookId,
    estimatedDelayLabelZh: input.dailyDrive?.estimatedDelayLabelZh,
  });

  const overallStatus = mapOverallStatus({
    gate,
    pendingAdjustmentCount,
    alertCount,
    hasBlockingAlert,
    hasImpact: planReality.hasImpact,
  });
  if (input.primaryRiskId) {
    overallStatus.primaryRiskId = input.primaryRiskId;
  }
  // 详情优先复用 daily-drive headline，避免两套文案分叉
  if (input.dailyDrive?.headline && overallStatus.code !== 'SUGGEST_ADJUST') {
    overallStatus.detailZh = input.dailyDrive.headline;
  }

  // 用下一站 ETA 丰富 ON_PLAN / NEEDS_ATTENTION 详情
  const etaForDetail =
    input.next?.etaLocalHHmm ||
    (input.currentActivity?.estimatedArrival &&
    input.currentActivity.estimatedArrival !== '--:--'
      ? input.currentActivity.estimatedArrival
      : undefined);
  if (etaForDetail && (overallStatus.code === 'ON_PLAN' || overallStatus.code === 'NEEDS_ATTENTION')) {
    overallStatus.detailZh = `预计 ${etaForDetail} 抵达 · ${
      overallStatus.code === 'ON_PLAN' ? '当前无阻断风险' : '请留意提醒项'
    }`;
  }

  const now = projectNow({
    lifecycle,
    nowStop: input.nowStop,
    next: input.next,
    currentActivity: input.currentActivity,
  });

  const exception = projectException({
    planReality,
    overallCode: overallStatus.code,
    primaryRiskId: input.primaryRiskId,
    pendingAdjustmentCount,
  });

  const selfDrive = projectSelfDrive({
    lifecycle,
    overallCode: overallStatus.code,
    confirm: input.confirmPayload,
    driverOptions: input.driverOptions,
    driveSession: input.driveSession,
    lodgingEtaZh: input.lodging?.detailZh?.match(/\d{2}:\d{2}/)?.[0],
    nextTitleZh: input.lodging?.nameZh,
  });

  const departureSuggestion = projectDepartureSuggestion({
    lifecycle,
    gate,
    suggestedLabelZh: input.dailyDrive?.suggestedDepartBeforeLabelZh,
    suggestedAt: input.dailyDrive?.suggestedDepartBeforeAt,
    estimatedDelayLabelZh: input.dailyDrive?.estimatedDelayLabelZh,
  });

  const vehicle = projectVehicle({
    confirm: input.confirmPayload,
    fuelDimDetailZh: fuelDim?.detailZh,
    fuelDimStatus: fuelDim?.status,
    nextFuelKm: nextFuelKmFromDim,
    roadDimStatus: roadDim?.status,
    vehicleTypeZh: input.vehicleTypeZh,
    rentalEmergencyPhone: input.rentalEmergencyPhone,
    continuousDriveWarningZh: input.continuousDriveWarningZh,
    lite: input.lite,
  });

  const teamReadiness = projectTeam(input.team);

  const lodging = input.lodging
    ? {
        nameZh: input.lodging.nameZh,
        detailZh: input.lodging.detailZh ?? '今晚住宿',
        statusZh: input.lodging.statusZh ?? '已安排',
        imageUrl: input.lite ? undefined : input.lodging.imageUrl,
      }
    : undefined;

  return {
    schemaId: OVERVIEW_DASHBOARD_SCHEMA_ID,
    contextVersion: input.contextVersion,
    serverTime: input.serverTime,
    lite: input.lite,
    trafficUpdatedAt:
      input.trafficUpdatedAt ?? input.dailyDrive?.evidence?.updatedAt,
    offlineMapHint:
      input.offlineMapAvailable != null
        ? { available: input.offlineMapAvailable }
        : undefined,
    overallStatus,
    selfDrive,
    nextDestination,
    departureSuggestion,
    vehicle,
    teamReadiness,
    attention:
      alertCount > 0 || pendingAdjustmentCount > 0
        ? {
            riskCount: alertCount,
            pendingDecisionCount: pendingAdjustmentCount,
          }
        : undefined,
    lodging,
    activeRunbookId: input.activeRunbookId,
    now,
    exception,
    planReality,
    advisories: input.advisories?.length ? input.advisories.slice(0, 6) : undefined,
    selfDriveKernel: input.selfDriveKernel,
  };
}
