/**
 * 权威驾驶会话 — 从持久化 + nav / field / confirm 派生
 */

import { DateTime } from 'luxon';
import type {
  DriveSessionDto,
  OverviewSelfDriveLifecycle,
  StoredDriveSession,
} from '../dto/mobile-overview-dashboard.types';
import { DRIVE_SESSION_SCHEMA_ID } from '../dto/mobile-overview-dashboard.types';
import type { TripActionCode } from '../dto/mobile-execution-quick-actions.types';

const CONTINUOUS_WARN_MINUTES = 120;

export interface DriveSessionProjectionInput {
  localDate: string;
  timezone: string;
  serverTime?: string;
  contextVersion: number;
  now?: DateTime;
  stored?: StoredDriveSession | null;
  dailyDriveGate?: 'CAN_DEPART' | 'NEEDS_ATTENTION' | 'BLOCKED';
  isConfirmed?: boolean;
  navSessions?: Array<{
    id: string;
    startedAt: string;
    startedBy?: string;
    endedAt?: string;
  }>;
  fieldReports?: Array<{
    actionCode: TripActionCode | string;
    reportedAt: string;
    reportedByMemberId?: string;
  }>;
  todayRemainingDriveMinutes?: number;
}

function minutesBetween(fromIso: string, to: DateTime): number {
  const from = DateTime.fromISO(fromIso, { setZone: true });
  if (!from.isValid) return 0;
  return Math.max(0, Math.round(to.diff(from, 'minutes').minutes));
}

function sameLocalDate(iso: string, localDate: string, timezone: string): boolean {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(timezone);
  return dt.isValid && dt.toISODate() === localDate;
}

function warningZh(continuous: number): string | undefined {
  if (continuous < CONTINUOUS_WARN_MINUTES) return undefined;
  return `已连续驾驶约 ${continuous} 分钟，建议在下一个安全停车点休息`;
}

function derivePhaseFromSignals(input: DriveSessionProjectionInput): {
  phase: OverviewSelfDriveLifecycle;
  continuousDriveMinutes: number;
  todayDrivenMinutes: number;
  lastDriverMemberId?: string;
  lastNavSessionId?: string;
} {
  const now = input.now ?? DateTime.now().setZone(input.timezone);
  if (input.dailyDriveGate === 'BLOCKED') {
    return { phase: 'BLOCKED', continuousDriveMinutes: 0, todayDrivenMinutes: 0 };
  }

  const todayReports = (input.fieldReports ?? [])
    .filter((r) => sameLocalDate(r.reportedAt, input.localDate, input.timezone))
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));
  const lastReport = todayReports[todayReports.length - 1];

  const todayNav = (input.navSessions ?? [])
    .filter((s) => sameLocalDate(s.startedAt, input.localDate, input.timezone))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  let todayDriven = 0;
  for (const s of todayNav) {
    const end = s.endedAt
      ? DateTime.fromISO(s.endedAt, { setZone: true })
      : now;
    const start = DateTime.fromISO(s.startedAt, { setZone: true });
    if (start.isValid && end.isValid) {
      todayDriven += Math.max(0, Math.round(end.diff(start, 'minutes').minutes));
    }
  }

  const openNav = [...todayNav].reverse().find((s) => !s.endedAt);

  if (lastReport?.actionCode === 'ARRIVED' || lastReport?.actionCode === 'END_EARLY') {
    return {
      phase: lastReport.actionCode === 'END_EARLY' ? 'DAY_ENDED' : 'ARRIVED',
      continuousDriveMinutes: 0,
      todayDrivenMinutes: todayDriven,
      lastDriverMemberId: lastReport.reportedByMemberId ?? openNav?.startedBy,
      lastNavSessionId: openNav?.id,
    };
  }

  if (
    lastReport?.actionCode === 'SAFE_STOP' ||
    lastReport?.actionCode === 'NEED_REST' ||
    lastReport?.actionCode === 'PAUSE_TRIP'
  ) {
    return {
      phase: 'TEMPORARY_STOP',
      continuousDriveMinutes: 0,
      todayDrivenMinutes: todayDriven,
      lastDriverMemberId: lastReport.reportedByMemberId ?? openNav?.startedBy,
      lastNavSessionId: openNav?.id,
    };
  }

  if (openNav) {
    const continuous = minutesBetween(openNav.startedAt, now);
    // CHANGE_DRIVER 后若仍有 open nav，从最新场报告后的 nav 起算
    const lastDriverChange = [...todayReports]
      .reverse()
      .find((r) => r.actionCode === 'CHANGE_DRIVER');
    let continuousDriveMinutes = continuous;
    if (
      lastDriverChange &&
      DateTime.fromISO(openNav.startedAt) < DateTime.fromISO(lastDriverChange.reportedAt)
    ) {
      continuousDriveMinutes = minutesBetween(lastDriverChange.reportedAt, now);
    }
    return {
      phase: 'DRIVING',
      continuousDriveMinutes,
      todayDrivenMinutes: Math.max(todayDriven, continuousDriveMinutes),
      lastDriverMemberId:
        lastDriverChange?.reportedByMemberId ?? openNav.startedBy,
      lastNavSessionId: openNav.id,
    };
  }

  if (input.isConfirmed) {
    return {
      phase: 'PREPARING',
      continuousDriveMinutes: 0,
      todayDrivenMinutes: todayDriven,
    };
  }

  return {
    phase: 'NOT_DEPARTED',
    continuousDriveMinutes: 0,
    todayDrivenMinutes: todayDriven,
  };
}

function projectFromStored(
  stored: StoredDriveSession,
  input: DriveSessionProjectionInput,
): DriveSessionDto {
  const now = input.now ?? DateTime.now().setZone(input.timezone);
  const serverTime = input.serverTime ?? now.toUTC().toISO() ?? new Date().toISOString();

  let continuous = stored.continuousAccumulatedMinutes ?? 0;
  let todayDriven = stored.todayDrivenMinutes ?? 0;
  let phase = stored.phase;

  if (input.dailyDriveGate === 'BLOCKED') {
    phase = 'BLOCKED';
  }

  if (phase === 'DRIVING' && stored.continuousStartedAt) {
    const live = minutesBetween(stored.continuousStartedAt, now);
    continuous = (stored.continuousAccumulatedMinutes ?? 0) + live;
    todayDriven = Math.max(todayDriven, continuous);
  }

  return {
    schemaId: DRIVE_SESSION_SCHEMA_ID,
    localDate: stored.localDate || input.localDate,
    timezone: input.timezone,
    phase,
    continuousDriveMinutes: continuous,
    todayDrivenMinutes: todayDriven,
    todayRemainingDriveMinutes:
      stored.todayRemainingDriveMinutes ?? input.todayRemainingDriveMinutes,
    lastDriverMemberId: stored.lastDriverMemberId,
    continuousDriveWarningZh: warningZh(continuous),
    serverTime,
    contextVersion: input.contextVersion,
    authoritative: true,
  };
}

/**
 * 优先读持久化 driveSession；否则由导航会话 / 现场上报 / 今日确认派生。
 */
export function projectDriveSession(input: DriveSessionProjectionInput): DriveSessionDto {
  const now = input.now ?? DateTime.now().setZone(input.timezone);
  const serverTime = input.serverTime ?? now.toUTC().toISO() ?? new Date().toISOString();

  if (input.stored && input.stored.localDate === input.localDate) {
    return projectFromStored(input.stored, { ...input, now, serverTime });
  }

  const derived = derivePhaseFromSignals({ ...input, now });
  return {
    schemaId: DRIVE_SESSION_SCHEMA_ID,
    localDate: input.localDate,
    timezone: input.timezone,
    phase: derived.phase,
    continuousDriveMinutes: derived.continuousDriveMinutes,
    todayDrivenMinutes: derived.todayDrivenMinutes,
    todayRemainingDriveMinutes: input.todayRemainingDriveMinutes,
    lastDriverMemberId: derived.lastDriverMemberId,
    continuousDriveWarningZh: warningZh(derived.continuousDriveMinutes),
    serverTime,
    contextVersion: input.contextVersion,
    authoritative: false,
  };
}

/** 写路径：导航开始 → DRIVING */
export function applyNavStartToDriveSession(input: {
  prev?: StoredDriveSession | null;
  localDate: string;
  startedAt: string;
  navSessionId: string;
  driverMemberId?: string;
}): StoredDriveSession {
  const prev = input.prev?.localDate === input.localDate ? input.prev : null;
  return {
    localDate: input.localDate,
    phase: 'DRIVING',
    continuousStartedAt: input.startedAt,
    continuousAccumulatedMinutes: 0,
    todayDrivenMinutes: prev?.todayDrivenMinutes ?? 0,
    todayRemainingDriveMinutes: prev?.todayRemainingDriveMinutes,
    lastDriverMemberId: input.driverMemberId ?? prev?.lastDriverMemberId,
    lastNavSessionId: input.navSessionId,
    updatedAt: new Date().toISOString(),
  };
}

/** 写路径：现场上报推进 phase */
export function applyFieldReportToDriveSession(input: {
  prev?: StoredDriveSession | null;
  localDate: string;
  actionCode: string;
  reportedAt: string;
  memberId?: string;
  now?: DateTime;
}): StoredDriveSession | null {
  const now = input.now ?? DateTime.now();
  const prev = input.prev?.localDate === input.localDate ? input.prev : null;
  let continuousAccumulated = prev?.continuousAccumulatedMinutes ?? 0;
  let todayDriven = prev?.todayDrivenMinutes ?? 0;

  if (prev?.phase === 'DRIVING' && prev.continuousStartedAt) {
    const live = minutesBetween(prev.continuousStartedAt, now);
    continuousAccumulated += live;
    todayDriven += live;
  }

  const base: StoredDriveSession = {
    localDate: input.localDate,
    phase: prev?.phase ?? 'NOT_DEPARTED',
    continuousAccumulatedMinutes: continuousAccumulated,
    todayDrivenMinutes: todayDriven,
    todayRemainingDriveMinutes: prev?.todayRemainingDriveMinutes,
    lastDriverMemberId: input.memberId ?? prev?.lastDriverMemberId,
    lastNavSessionId: prev?.lastNavSessionId,
    updatedAt: input.reportedAt,
  };

  switch (input.actionCode) {
    case 'SAFE_STOP':
    case 'NEED_REST':
    case 'PAUSE_TRIP':
      return {
        ...base,
        phase: 'TEMPORARY_STOP',
        continuousStartedAt: undefined,
        continuousAccumulatedMinutes: 0,
      };
    case 'ARRIVED':
      return {
        ...base,
        phase: 'ARRIVED',
        continuousStartedAt: undefined,
        continuousAccumulatedMinutes: 0,
      };
    case 'END_EARLY':
      return {
        ...base,
        phase: 'DAY_ENDED',
        continuousStartedAt: undefined,
        continuousAccumulatedMinutes: 0,
      };
    case 'CHANGE_DRIVER':
      return {
        ...base,
        phase: prev?.phase === 'DRIVING' || prev?.phase === 'TEMPORARY_STOP'
          ? 'DRIVING'
          : prev?.phase ?? 'PREPARING',
        continuousStartedAt: input.reportedAt,
        continuousAccumulatedMinutes: 0,
        lastDriverMemberId: input.memberId ?? prev?.lastDriverMemberId,
      };
    default:
      return prev ?? null;
  }
}

export function applyConfirmToDriveSession(input: {
  prev?: StoredDriveSession | null;
  localDate: string;
  confirmedAt: string;
  driverMemberId?: string;
}): StoredDriveSession {
  const prev = input.prev?.localDate === input.localDate ? input.prev : null;
  if (prev && (prev.phase === 'DRIVING' || prev.phase === 'TEMPORARY_STOP' || prev.phase === 'ARRIVED')) {
    return {
      ...prev,
      lastDriverMemberId: input.driverMemberId ?? prev.lastDriverMemberId,
      updatedAt: input.confirmedAt,
    };
  }
  return {
    localDate: input.localDate,
    phase: 'PREPARING',
    continuousAccumulatedMinutes: 0,
    todayDrivenMinutes: prev?.todayDrivenMinutes ?? 0,
    lastDriverMemberId: input.driverMemberId,
    updatedAt: input.confirmedAt,
  };
}
