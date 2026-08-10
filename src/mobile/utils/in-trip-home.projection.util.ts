/**
 * 行中执行首页 — 纯投影（heading / 七行 / 仅提醒 / activeRunbook）
 */

import type { ExecutionAlertDto, ExecutionAlertsDto } from '../dto/mobile-execution.types';
import {
  ATTENTION_LABELS_ZH,
  IMPORTANT_INFO_ORDER,
  IMPORTANT_INFO_TITLES_ZH,
  IN_TRIP_HOME_SCHEMA_ID,
  RUNBOOK_TRIGGER_TITLES_ZH,
  type ActiveRunbookSummaryDto,
  type AppliedProposalSummaryDto,
  type ConfirmReasonCode,
  type ImportantInfoKind,
  type ImportantInfoRowDto,
  type ImportantInfoTrailingStyle,
  type InlineReminderDto,
  type InlineReminderKind,
  type InTripAttention,
  type InTripHomeDto,
  type RunbookSeverity,
  type RunbookTrigger,
} from '../dto/mobile-in-trip-home.types';

export interface InTripHomeProjectionInput {
  destinationNameZh?: string;
  destinationLocalName?: string;
  etaRangeLabelZh?: string;
  progress?: number;
  distanceProgressLabelZh?: string;
  remainingDurationLabelZh?: string;
  toItemId?: string;

  road?: {
    alertTitle?: string;
    alertDetail?: string;
    severity?: 'high' | 'medium' | 'low' | 'ok';
    plowDelayRangeMin?: [number, number];
  };
  remainingDrive?: {
    detailZh?: string;
    trailingZh?: string;
  };
  safeParking?: {
    detailZh?: string;
    trailingZh?: string;
    relatedPoiId?: string;
    restSuggested?: boolean;
  };
  fuel?: {
    detailZh?: string;
    trailingZh?: string;
    relatedPoiId?: string;
  };
  hardWindow?: {
    detailZh?: string;
    trailingZh?: string;
    relatedItemId?: string;
    attention?: boolean;
  };

  alerts?: ExecutionAlertsDto | null;
  /** 已派生的活跃 Runbook 摘要（服务层） */
  activeRunbook?: ActiveRunbookSummaryDto | null;
  /** §7.2 提醒候选（服务层可覆盖） */
  inlineReminder?: InlineReminderDto | null;
  appliedProposal?: AppliedProposalSummaryDto | null;
  dismissedReminderIds?: string[];
  includeReminder?: boolean;
  includeActiveRunbook?: boolean;
  evidenceUpdatedAt?: string;
  contextVersion?: number;
}

function isBlockingAlert(alert: ExecutionAlertDto): boolean {
  return (
    alert.level === 'STOP' ||
    alert.level === 'REPLAN_REQUIRED' ||
    alert.executionGate === 'STOP' ||
    alert.executionGate === 'REPLAN_REQUIRED' ||
    alert.requiresImmediateAttention === true ||
    alert.riskLevel === 'CRITICAL' ||
    alert.riskLevel === 'HIGH'
  );
}

function alertBlob(alert: ExecutionAlertDto): string {
  return `${alert.riskType ?? ''} ${alert.riskKey ?? ''} ${alert.title} ${alert.reason} ${alert.impact ?? ''}`.toLowerCase();
}

/** Map alert → Runbook trigger; null if not a §7.3 scenario. */
export function inferRunbookTrigger(alert: ExecutionAlertDto): RunbookTrigger | null {
  if (!isBlockingAlert(alert)) return null;
  const blob = alertBlob(alert);
  if (/closure|closed|封路|封闭|路段关闭|road.?status.?closed|不可通行/.test(blob)) {
    return 'ROAD_CLOSURE';
  }
  if (/fuel|油量|燃油|加油|petrol|gas.?station|无法达.*油/.test(blob)) {
    return 'FUEL_INSUFFICIENT';
  }
  if (/booking|集合|入住|check.?in|eta.?miss|错过|迟到|晚到/.test(blob)) {
    return 'BOOKING_ETA_MISS';
  }
  if (/wind|强风|阵风|gust|横风/.test(blob)) {
    return 'STRONG_WIND';
  }
  // STOP / REPLAN without clear theme → treat as road closure style handling
  if (alert.level === 'STOP' || alert.executionGate === 'STOP') {
    return 'ROAD_CLOSURE';
  }
  return null;
}

export function resolveRunbookSeverity(alert: ExecutionAlertDto): RunbookSeverity {
  if (
    alert.level === 'STOP' ||
    alert.executionGate === 'STOP' ||
    alert.riskLevel === 'CRITICAL'
  ) {
    return 'CRITICAL';
  }
  return 'HIGH';
}

export function buildActiveRunbookSummary(
  alert: ExecutionAlertDto,
  runbookId: string,
): ActiveRunbookSummaryDto | null {
  const trigger = inferRunbookTrigger(alert);
  if (!trigger) return null;
  const triggerTitleZh = RUNBOOK_TRIGGER_TITLES_ZH[trigger];
  return {
    runbookId,
    trigger,
    triggerTitleZh,
    alertSummaryZh: alert.userNarrative?.whatHappened ?? alert.reason ?? alert.title,
    pageTitleZh: `${triggerTitleZh}处理建议`,
    severity: resolveRunbookSeverity(alert),
  };
}

/** Pick primary blocking alert that maps to a Runbook trigger. */
export function pickRunbookSourceAlert(
  alerts: ExecutionAlertsDto | null | undefined,
): ExecutionAlertDto | null {
  if (!alerts) return null;
  const candidates: ExecutionAlertDto[] = [];
  if (alerts.primaryRisk) candidates.push(alerts.primaryRisk);
  for (const a of alerts.alerts ?? []) candidates.push(a);
  for (const a of alerts.independentRisks ?? []) candidates.push(a);

  for (const alert of candidates) {
    if (inferRunbookTrigger(alert)) return alert;
  }
  return null;
}

/**
 * §7.2 inline reminder from light (non-blocking) signals.
 * Never returns Runbook-level kinds; returns null when activeRunbook covers theme.
 */
export function projectInlineReminder(opts: {
  alerts?: ExecutionAlertsDto | null;
  activeRunbook?: ActiveRunbookSummaryDto | null;
  restSuggested?: boolean;
  sunsetBufferDrop?: boolean;
  etaIncreased?: boolean;
  fuelSuggested?: boolean;
  windIncreased?: boolean;
  dismissedReminderIds?: string[];
}): InlineReminderDto | null {
  const dismissed = new Set(opts.dismissedReminderIds ?? []);
  const blockedThemes = new Set<InlineReminderKind>();
  if (opts.activeRunbook?.trigger === 'STRONG_WIND') blockedThemes.add('WIND_INCREASED');
  if (opts.activeRunbook?.trigger === 'FUEL_INSUFFICIENT') blockedThemes.add('FUEL_SUGGESTED');
  if (opts.activeRunbook?.trigger === 'BOOKING_ETA_MISS') blockedThemes.add('ETA_INCREASED');
  if (opts.activeRunbook?.trigger === 'ROAD_CLOSURE') {
    // road closure supersedes soft ETA/rest noise on same surface
    blockedThemes.add('ETA_INCREASED');
  }

  const candidates: InlineReminderDto[] = [];

  if (opts.restSuggested) {
    candidates.push({
      id: 'rem_rest_suggested',
      kind: 'REST_SUGGESTED',
      titleZh: '休息建议',
      messageZh: '你将连续驾驶约 2 小时，建议在下一个停车点休息',
      dismissible: true,
    });
  }
  if (opts.sunsetBufferDrop) {
    candidates.push({
      id: 'rem_sunset_buffer',
      kind: 'SUNSET_BUFFER_DROP',
      titleZh: '日落缓冲下降',
      messageZh: '日落前到达缓冲减少，建议留意后续时间窗',
      dismissible: true,
    });
  }
  if (opts.fuelSuggested) {
    candidates.push({
      id: 'rem_fuel_suggested',
      kind: 'FUEL_SUGGESTED',
      titleZh: '建议加油',
      messageZh: '建议在下一油站加油（当前仍可达）',
      dismissible: true,
    });
  }
  if (opts.windIncreased) {
    candidates.push({
      id: 'rem_wind_increased',
      kind: 'WIND_INCREASED',
      titleZh: '风力略增',
      messageZh: '风力略有增强，未达高风险阈值，可继续行驶并留意横风',
      dismissible: true,
    });
  }
  if (opts.etaIncreased) {
    candidates.push({
      id: 'rem_eta_increased',
      kind: 'ETA_INCREASED',
      titleZh: '预计到达推迟',
      messageZh: '预计到达时间约增加 10 分钟，无需改道',
      dismissible: true,
    });
  }

  // Light alerts → soft reminders (never blocking)
  for (const alert of collectLightAlerts(opts.alerts)) {
    const kind = inferInlineReminderKind(alert);
    if (!kind) continue;
    const id = `rem_${alert.riskId ?? alert.id}`;
    candidates.push({
      id,
      kind,
      titleZh: softReminderTitle(kind),
      messageZh: alert.userNarrative?.recommendation ?? alert.reason ?? alert.title,
      dismissible: true,
    });
  }

  for (const rem of candidates) {
    if (blockedThemes.has(rem.kind)) continue;
    if (dismissed.has(rem.id)) continue;
    return rem;
  }
  return null;
}

function collectLightAlerts(alerts: ExecutionAlertsDto | null | undefined): ExecutionAlertDto[] {
  if (!alerts) return [];
  const out: ExecutionAlertDto[] = [];
  const push = (a?: ExecutionAlertDto | null) => {
    if (a && !isBlockingAlert(a)) out.push(a);
  };
  push(alerts.primaryRisk);
  for (const a of alerts.alerts ?? []) push(a);
  for (const a of alerts.independentRisks ?? []) push(a);
  return out;
}

function inferInlineReminderKind(alert: ExecutionAlertDto): InlineReminderKind | null {
  const blob = alertBlob(alert);
  if (/rest|休息|疲劳|连续驾驶/.test(blob)) return 'REST_SUGGESTED';
  if (/sunset|日落|日照|缓冲/.test(blob)) return 'SUNSET_BUFFER_DROP';
  if (/fuel|加油|油站/.test(blob)) return 'FUEL_SUGGESTED';
  if (/wind|风/.test(blob)) return 'WIND_INCREASED';
  if (/eta|延误|推迟|delay/.test(blob)) return 'ETA_INCREASED';
  return null;
}

function softReminderTitle(kind: InlineReminderKind): string {
  switch (kind) {
    case 'ETA_INCREASED':
      return '预计到达推迟';
    case 'WIND_INCREASED':
      return '风力略增';
    case 'FUEL_SUGGESTED':
      return '建议加油';
    case 'REST_SUGGESTED':
      return '休息建议';
    case 'SUNSET_BUFFER_DROP':
      return '日落缓冲下降';
  }
}

export function resolveInTripAttention(opts: {
  alerts?: ExecutionAlertsDto | null;
  activeRunbook?: ActiveRunbookSummaryDto | null;
  inlineReminder?: InlineReminderDto | null;
}): InTripAttention {
  if (opts.activeRunbook) {
    return opts.activeRunbook.severity === 'CRITICAL' ? 'BLOCKED' : 'NEEDS_ATTENTION';
  }
  const primary = opts.alerts?.primaryRisk;
  if (primary && isBlockingAlert(primary)) {
    if (primary.level === 'STOP' || primary.executionGate === 'STOP') return 'BLOCKED';
    return 'NEEDS_ATTENTION';
  }
  if (opts.alerts?.requiredAction === 'STOP') return 'BLOCKED';
  if (opts.alerts?.requiredAction === 'REPLAN') return 'NEEDS_ATTENTION';
  if (opts.inlineReminder) return 'NEEDS_ATTENTION';
  return 'ON_TRACK';
}

function unknownRow(kind: ImportantInfoKind): ImportantInfoRowDto {
  return {
    kind,
    titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
    detailZh: '暂无可靠数据',
    trailingZh: '未知',
    trailingStyle: 'PLAIN',
    status: 'UNKNOWN',
  };
}

function riskTrailing(
  alert: ExecutionAlertDto | null | undefined,
): { trailingZh: string; trailingStyle: ImportantInfoTrailingStyle; detailZh: string } {
  if (!alert) {
    return { trailingZh: '低风险', trailingStyle: 'SUCCESS_BADGE', detailZh: '当前无明显活跃风险' };
  }
  if (alert.level === 'STOP' || alert.riskLevel === 'CRITICAL') {
    return {
      trailingZh: '高风险',
      trailingStyle: 'WARNING_BADGE',
      detailZh: alert.userNarrative?.whatHappened ?? alert.title,
    };
  }
  if (
    alert.level === 'REPLAN_REQUIRED' ||
    alert.riskLevel === 'HIGH' ||
    alert.requiresImmediateAttention
  ) {
    return {
      trailingZh: '中风险',
      trailingStyle: 'WARNING_BADGE',
      detailZh: alert.userNarrative?.whatHappened ?? alert.title,
    };
  }
  if (alert.riskLevel === 'LOW') {
    return {
      trailingZh: '低风险',
      trailingStyle: 'SUCCESS_BADGE',
      detailZh: alert.userNarrative?.whatHappened ?? alert.title,
    };
  }
  return {
    trailingZh: '中风险',
    trailingStyle: 'WARNING_BADGE',
    detailZh: alert.userNarrative?.whatHappened ?? alert.title,
  };
}

export function projectImportantInfo(input: InTripHomeProjectionInput): ImportantInfoRowDto[] {
  const rows: ImportantInfoRowDto[] = [];

  for (const kind of IMPORTANT_INFO_ORDER) {
    switch (kind) {
      case 'NEXT_ROAD_STATUS': {
        if (!input.road?.alertTitle && !input.road?.alertDetail) {
          rows.push(unknownRow(kind));
          break;
        }
        const ok = input.road.severity === 'ok' || !input.road.severity;
        const closed = input.road.severity === 'high';
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh: input.road.alertDetail || input.road.alertTitle || '通行状态待确认',
          trailingZh: closed ? '封闭' : ok ? '良好' : '注意',
          trailingStyle: closed ? 'WARNING_BADGE' : ok ? 'SUCCESS_BADGE' : 'WARNING',
          status: closed ? 'ATTENTION' : ok ? 'OK' : 'ATTENTION',
        });
        break;
      }
      case 'REMAINING_DRIVE': {
        if (!input.remainingDrive?.detailZh && !input.remainingDurationLabelZh) {
          rows.push(unknownRow(kind));
          break;
        }
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh:
            input.remainingDrive?.detailZh ??
            input.remainingDurationLabelZh ??
            '剩余驾驶时间待评估',
          trailingZh: input.remainingDrive?.trailingZh ?? input.etaRangeLabelZh,
          trailingStyle: 'PLAIN',
          status: 'OK',
          relatedItemId: input.toItemId,
        });
        break;
      }
      case 'DELAY_INTERVAL': {
        const range = input.road?.plowDelayRangeMin;
        if (!range) {
          rows.push({
            ...unknownRow(kind),
            detailZh: '当前无明显延误区间',
            trailingZh: '无延误',
            trailingStyle: 'SUCCESS_BADGE',
            status: 'OK',
          });
          break;
        }
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh: input.road?.alertDetail || '受路况影响',
          trailingZh: `${range[0]} – ${range[1]} 分钟`,
          trailingStyle: 'WARNING',
          status: 'ATTENTION',
        });
        break;
      }
      case 'NEXT_SAFE_PARKING': {
        if (!input.safeParking?.detailZh?.trim()) {
          rows.push({
            ...unknownRow(kind),
            detailZh: '走廊停车点评估中',
            trailingZh: '稍后刷新',
            status: 'ATTENTION',
          });
          break;
        }
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh: input.safeParking.detailZh.trim(),
          trailingZh: input.safeParking.trailingZh?.trim() || '距离待确认',
          trailingStyle: input.safeParking.restSuggested ? 'REST_SUGGESTED' : 'PLAIN',
          relatedPoiId: input.safeParking.relatedPoiId,
          status: 'OK',
        });
        break;
      }
      case 'NEXT_FUEL': {
        if (!input.fuel?.detailZh?.trim()) {
          rows.push({
            ...unknownRow(kind),
            detailZh: '下一可靠油站评估中',
            trailingZh: '稍后刷新',
            status: 'ATTENTION',
          });
          break;
        }
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh: input.fuel.detailZh.trim(),
          trailingZh: input.fuel.trailingZh?.trim() || '距离待确认',
          trailingStyle: 'PLAIN',
          relatedPoiId: input.fuel.relatedPoiId,
          status: 'OK',
        });
        break;
      }
      case 'NEXT_HARD_WINDOW': {
        if (!input.hardWindow?.detailZh?.trim()) {
          rows.push({
            ...unknownRow(kind),
            detailZh: '今日暂无硬时间窗',
            trailingZh: '无截止',
            trailingStyle: 'SUCCESS_BADGE',
            status: 'OK',
          });
          break;
        }
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh: input.hardWindow.detailZh.trim(),
          trailingZh:
            input.hardWindow.trailingZh?.trim() ||
            (input.hardWindow.attention ? '需留意' : '仍可赶上'),
          trailingStyle: input.hardWindow.attention ? 'WARNING' : 'EMPHASIS',
          relatedItemId: input.hardWindow.relatedItemId,
          status: input.hardWindow.attention ? 'ATTENTION' : 'OK',
        });
        break;
      }
      case 'CURRENT_RISK': {
        const alert =
          input.alerts?.primaryRisk ??
          input.alerts?.alerts?.[0] ??
          null;
        const { trailingZh, trailingStyle, detailZh } = riskTrailing(alert);
        rows.push({
          kind,
          titleZh: IMPORTANT_INFO_TITLES_ZH[kind],
          detailZh,
          trailingZh,
          trailingStyle,
          relatedRiskId: alert ? alert.riskId ?? alert.id : undefined,
          status: alert ? 'ATTENTION' : 'OK',
        });
        break;
      }
    }
  }

  return rows;
}

export function projectInTripHome(input: InTripHomeProjectionInput): InTripHomeDto {
  const includeReminder = input.includeReminder !== false;
  const includeActiveRunbook = input.includeActiveRunbook !== false;

  const activeRunbook = includeActiveRunbook ? input.activeRunbook ?? null : null;
  const inlineReminder = includeReminder
    ? input.inlineReminder === undefined
      ? projectInlineReminder({
          alerts: input.alerts,
          activeRunbook,
          dismissedReminderIds: input.dismissedReminderIds,
        })
      : input.inlineReminder
    : null;

  const attention = resolveInTripAttention({
    alerts: input.alerts,
    activeRunbook,
    inlineReminder,
  });

  return {
    schemaId: IN_TRIP_HOME_SCHEMA_ID,
    heading: {
      destinationNameZh: input.destinationNameZh?.trim() || '下一站',
      destinationLocalName: input.destinationLocalName,
      etaRangeLabelZh: input.etaRangeLabelZh?.trim() || '预计到达时间待评估',
      attention,
      attentionLabelZh: ATTENTION_LABELS_ZH[attention],
      progress: input.progress,
      distanceProgressLabelZh: input.distanceProgressLabelZh,
      remainingDurationLabelZh: input.remainingDurationLabelZh,
      toItemId: input.toItemId,
    },
    inlineReminder,
    appliedProposal: input.appliedProposal ?? null,
    importantInfo: projectImportantInfo(input),
    activeRunbook,
    evidence: {
      updatedAt: input.evidenceUpdatedAt ?? new Date().toISOString(),
    },
    contextVersion: input.contextVersion,
  };
}

/** §7.4 reason codes ↔ requiresUserConfirm */
export function requiresUserConfirmFromReasons(codes: ConfirmReasonCode[]): boolean {
  return codes.length > 0;
}

export const CONFIRM_REASON_LABELS_ZH: Record<ConfirmReasonCode, string> = {
  CHANGE_MAIN_ROUTE: '将更改主路线',
  DELETE_ACTIVITY: '将删除行程活动',
  CHANGE_LODGING: '将变更住宿安排',
  LARGE_DETOUR: '绕行里程较大',
  SIGNIFICANT_DRIVE_INCREASE: '明显增加驾驶时间',
  ACCEPT_HIGH_RISK: '需接受高风险路况',
  AFFECTS_BOOKED_ITEM: '影响已预订项目',
};

export function confirmReasonsZhFor(codes: ConfirmReasonCode[]): string[] {
  return codes.map((c) => CONFIRM_REASON_LABELS_ZH[c]);
}

/** Stable runbook id from trigger + risk. */
export function buildRunbookId(trigger: RunbookTrigger, riskId: string): string {
  const safe = riskId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return `rb_${trigger.toLowerCase()}_${safe}`;
}

export function buildProposalId(runbookId: string, optionId: string): string {
  return `vp_${runbookId}_${optionId}`;
}
