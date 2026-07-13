/**
 * Human-readable copy for Execution Slip repair options.
 */

import { DateTime } from 'luxon';
import {
  EXECUTION_SLIP_CANDIDATE_IDS,
} from '../contracts/execution-slip.types';
import type {
  ExecutionSlipChangePreview,
  ExecutionSlipOptionContext,
  ExecutionSlipOptionCopy,
} from '../contracts/execution-slip-option-preview.types';

export function formatExecutionSlipClockLabel(
  isoOrClock: string | undefined,
  timezone: string,
  referenceIso?: string,
): string | undefined {
  if (!isoOrClock) return undefined;
  if (/^\d{1,2}:\d{2}$/.test(isoOrClock.trim())) {
    return isoOrClock.trim();
  }
  const dt = DateTime.fromISO(isoOrClock, { setZone: true });
  if (dt.isValid) {
    return dt.setZone(timezone).toFormat('HH:mm');
  }
  if (referenceIso) {
    const ref = DateTime.fromISO(referenceIso, { setZone: true }).setZone(timezone);
    const [hour, minute] = isoOrClock.split(':').map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return ref.set({ hour, minute, second: 0, millisecond: 0 }).toFormat('HH:mm');
    }
  }
  return isoOrClock;
}

export function buildExecutionSlipOptionCopy(
  candidateId: string,
  ctx: ExecutionSlipOptionContext,
): ExecutionSlipOptionCopy {
  const etaLabel = ctx.scheduleContext.projectedEtaLabel;
  const nextEntryLabel = ctx.scheduleContext.nextLastEntryAtLabel;
  const slip = ctx.scheduleContext.slipMinutes;

  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY) {
    const changePreview: ExecutionSlipChangePreview = {
      remove: {
        activityId: ctx.nextActivityId,
        title: ctx.nextActivityTitle,
        lastEntryAt: ctx.scheduleContext.nextLastEntryAt,
        lastEntryAtLabel: nextEntryLabel,
      },
    };
    const etaPart = etaLabel ? `预计 ${etaLabel} 抵达` : '按当前延误';
    const entryPart = nextEntryLabel ? `，晚于最后入场 ${nextEntryLabel}` : '';
    return {
      title: `跳过「${ctx.nextActivityTitle}」`,
      summary: `${etaPart}${entryPart}；今日行程将移除这一站`,
      preserves: ['保留其余已排行程', '不再占用前往该站的在途时间'],
      sacrifices: [`今日无法完成「${ctx.nextActivityTitle}」`],
      changePreview,
    };
  }

  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY) {
    const substituteTitle =
      ctx.substituteActivityTitle ?? '附近备选体验';
    const substituteEntryLabel =
      ctx.substituteLastEntryAtLabel ?? ctx.substituteLastEntryAt;
    const changePreview: ExecutionSlipChangePreview = {
      remove: {
        activityId: ctx.nextActivityId,
        title: ctx.nextActivityTitle,
        lastEntryAt: ctx.scheduleContext.nextLastEntryAt,
        lastEntryAtLabel: nextEntryLabel,
      },
      add: {
        activityId: ctx.substituteActivityId,
        title: substituteTitle,
        lastEntryAt: ctx.substituteLastEntryAt,
        lastEntryAtLabel: substituteEntryLabel,
      },
    };
    const entryPart = substituteEntryLabel
      ? `备选点最后入场 ${substituteEntryLabel}`
      : '备选点时间窗更宽松';
    const etaPart = etaLabel ? `预计 ${etaLabel} 抵达，` : '';
    return {
      title: `改去「${substituteTitle}」`,
      summary: `替换「${ctx.nextActivityTitle}」；${etaPart}${entryPart}，预计可赶上`,
      preserves: ['保留今日后续行程结构', '尽量守住核心体验意图'],
      sacrifices: [`不再前往「${ctx.nextActivityTitle}」`],
      changePreview,
    };
  }

  if (candidateId === EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY) {
    const shortenMinutes = ctx.shortenMinutes ?? 0;
    const changePreview: ExecutionSlipChangePreview = {
      shortenMinutes,
      remove: {
        activityId: ctx.currentActivityId,
        title: ctx.currentActivityTitle,
      },
    };
    const shortenPart =
      shortenMinutes > 0 ? `在当前站少停留约 ${shortenMinutes} 分钟` : '压缩当前停留时间';
    const entryPart = nextEntryLabel ? `争取赶上「${ctx.nextActivityTitle}」的 ${nextEntryLabel} 入场` : `争取赶上「${ctx.nextActivityTitle}」`;
    return {
      title: shortenMinutes > 0 ? `缩短当前停留 ${shortenMinutes} 分钟` : '缩短当前停留',
      summary: `${shortenPart}，${entryPart}`,
      preserves: [`保留「${ctx.nextActivityTitle}」在原计划内`, '不删除已选体验点'],
      sacrifices: [`在「${ctx.currentActivityTitle}」的游览时间减少`],
      changePreview,
    };
  }

  const slipPart = slip != null && slip > 0 ? `延误约 ${slip} 分钟` : '当前存在时间偏差';
  return {
    title: '调整后续安排',
    summary: slipPart,
    preserves: ['尽量保留当前行程目标'],
    sacrifices: ['可能需要调整部分安排以消除阻断'],
  };
}

export function buildExecutionSlipScheduleContext(
  input: {
    projectedEta?: string;
    lastEntryAt?: string;
    slipMinutes?: number;
    travelDurationMinutes?: number;
    timezone: string;
    referenceIso?: string;
  },
): ExecutionSlipOptionContext['scheduleContext'] {
  const timezone = input.timezone;
  return {
    projectedEta: input.projectedEta,
    projectedEtaLabel: formatExecutionSlipClockLabel(
      input.projectedEta,
      timezone,
      input.referenceIso,
    ),
    nextLastEntryAt: input.lastEntryAt,
    nextLastEntryAtLabel: formatExecutionSlipClockLabel(
      input.lastEntryAt,
      timezone,
      input.referenceIso ?? input.projectedEta,
    ),
    slipMinutes: input.slipMinutes,
    travelDurationMinutes: input.travelDurationMinutes,
    timezone,
  };
}
