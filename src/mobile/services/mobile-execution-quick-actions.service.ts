import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { computeMobileContextVersion } from '../utils/mobile-execution.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import type { TripContextChangedSection } from '../ws/trip-context-ws.types';
import { MobileExecutionWriteService } from './mobile-execution-write.service';
import { MobileExecutionService } from './mobile-execution.service';
import {
  MEMBER_NEED_CODES,
  MEMBER_STATUS_REPORT_TTL_MS,
  QUICK_ACTIONS_CONTEXT_SCHEMA_ID,
  type CreateMemberStatusReportBody,
  type CreateTripFieldReportBody,
  type MemberReportListScope,
  type MemberStatusReportDto,
  type MemberStatusReportListDto,
  type QuickActionsContextDto,
  type QuickActionsMobileMetadata,
  type StoredMemberStatusReport,
  type StoredTripFieldReport,
  type TransitionMemberStatusBody,
  type TripActionCode,
  type TripFieldReportResponseDto,
} from '../dto/mobile-execution-quick-actions.types';
import {
  NEED_LABEL_ZH,
  LIFECYCLE_LABEL_ZH,
  SCENE_LABEL_ZH,
  buildArrangementFromBody,
  buildSourceLabelZh,
  canTransitionLifecycle,
  filterAllowedTransitionsForViewer,
  isMemberNeedCode,
  isOpenLifecycle,
  isTerminalLifecycle,
  projectMemberSuggestion,
  projectTripFieldFollowUp,
  resolveQuickActionsScene,
  resolveReportPriority,
  tripActionsForScene,
} from '../utils/execution-quick-actions.projection.util';
import {
  resolveNextFuelAlongCorridor,
  resolveNextSafeParking,
  resolveNextToiletOrParking,
  type CorridorPoiHit,
} from '../utils/execution-corridor-poi.util';
import { DEFAULT_TRIP_DISPLAY_TIMEZONE } from '../../common/utils/format-clock-label.util';
import { DateTime } from 'luxon';
import { applyFieldReportToDriveSession } from '../utils/drive-session.projection.util';
import type { StoredDriveSession } from '../dto/mobile-overview-dashboard.types';

interface MobileMetaBag extends QuickActionsMobileMetadata {
  dailyDrive?: {
    byLocalDate?: Record<
      string,
      { payload?: { driverMemberId?: string } }
    >;
  };
  driveSession?: StoredDriveSession;
  idempotencyKeys?: Record<string, string>;
  [key: string]: unknown;
}

type MemberLite = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  collabRole: string;
};

@Injectable()
export class MobileExecutionQuickActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly mobileWrite: MobileExecutionWriteService,
    private readonly mobileRead: MobileExecutionService,
    private readonly contextNotifier: TripContextChangeNotifierService,
  ) {}

  async getContext(tripId: string, userId: string): Promise<QuickActionsContextDto> {
    await this.access.assertTripMember(tripId, userId);
    const members = await this.loadMembers(tripId);
    const viewer = members.find((m) => m.id === userId);
    if (!viewer) throw new ForbiddenException('非行程成员');

    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);
    const scene = await this.resolveScene(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    await this.expireStaleReports(tripId, mobile);

    const openReportCount = (mobile.memberStatusReports ?? []).filter(
      (r) =>
        isOpenLifecycle(r.lifecycleStatus) &&
        (r.subjectMemberId === userId || r.reporterMemberId === userId),
    ).length;

    const contextVersion = await this.resolveContextVersion(tripId);

    return {
      schemaId: QUICK_ACTIONS_CONTEXT_SCHEMA_ID,
      scene,
      sceneLabelZh: SCENE_LABEL_ZH[scene],
      viewerRole: role,
      myStatusActions: [...MEMBER_NEED_CODES],
      tripActions: tripActionsForScene(scene, role.canManageTrip),
      openReportCount,
      contextVersion,
    };
  }

  async listMemberStatusReports(
    tripId: string,
    userId: string,
    opts?: { scope?: string; memberId?: string; limit?: number },
  ): Promise<MemberStatusReportListDto> {
    await this.access.assertTripMember(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    await this.expireStaleReports(tripId, mobile);

    const scope = (opts?.scope ?? 'open') as MemberReportListScope;
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const members = await this.loadMembers(tripId);
    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);

    let rows = [...(mobile.memberStatusReports ?? [])];
    if (scope === 'open') {
      rows = rows.filter((r) => isOpenLifecycle(r.lifecycleStatus));
    } else if (scope === 'mine') {
      rows = rows.filter(
        (r) => r.subjectMemberId === userId || r.reporterMemberId === userId,
      );
    }
    if (opts?.memberId) {
      rows = rows.filter((r) => r.subjectMemberId === opts.memberId);
    }

    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const contextVersion = await this.resolveContextVersion(tripId);

    return {
      items: rows.slice(0, limit).map((r) =>
        this.toReportDto(r, members, userId, role.canManageTrip, driverId, contextVersion),
      ),
      contextVersion,
    };
  }

  async getMemberStatusReport(
    tripId: string,
    userId: string,
    reportId: string,
  ): Promise<MemberStatusReportDto> {
    await this.access.assertTripMember(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    await this.expireStaleReports(tripId, mobile);
    const row = (mobile.memberStatusReports ?? []).find((r) => r.id === reportId);
    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `报告 ${reportId} 不存在`,
      });
    }
    const members = await this.loadMembers(tripId);
    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);
    const contextVersion = await this.resolveContextVersion(tripId);
    return this.toReportDto(
      row,
      members,
      userId,
      role.canManageTrip || role.isCurrentDriver,
      driverId,
      contextVersion,
    );
  }

  async createMemberStatusReport(
    tripId: string,
    userId: string,
    body: CreateMemberStatusReportBody,
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<MemberStatusReportDto> {
    this.requireIdempotencyKey(opts.idempotencyKey);
    if (opts.ifMatch != null) {
      await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);
    }

    await this.access.assertTripMember(tripId, userId);
    if (!isMemberNeedCode(body?.needCode)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '非法 needCode',
      });
    }
    if (body.source !== 'SELF' && body.source !== 'PROXY') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'source 必须是 SELF 或 PROXY',
      });
    }
    if (body.note != null && String(body.note).length > 200) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'note 最多 200 字',
      });
    }

    const members = await this.loadMembers(tripId);
    const driverIdEarly = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverIdEarly);
    const canProxy = role.canProxyReport || role.isCurrentDriver;
    const canManage = role.canManageTrip || role.isCurrentDriver;
    const memberIds = new Set(members.map((m) => m.id));

    let subjectMemberId = userId;
    if (body.source === 'PROXY') {
      if (!canProxy) {
        throw new ForbiddenException({
          code: 'PROXY_NOT_ALLOWED',
          message: '无代报权限',
        });
      }
      if (!body.subjectMemberId?.trim()) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '代报时 subjectMemberId 必填',
        });
      }
      if (body.subjectMemberId === userId) {
        throw new BadRequestException({
          code: 'SUBJECT_CANNOT_BE_SELF_FOR_PROXY',
          message: '代报对象不能是自己，请改走自报',
        });
      }
      if (!memberIds.has(body.subjectMemberId)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'subjectMemberId 必须是本行程成员',
        });
      }
      subjectMemberId = body.subjectMemberId;
    }

    const mobile = await this.loadMobileMeta(tripId);
    await this.expireStaleReports(tripId, mobile, false);
    const idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}) };
    const prior = idempotencyKeys[opts.idempotencyKey!];
    if (prior?.startsWith('msr::')) {
      const priorId = prior.slice('msr::'.length);
      const existing = (mobile.memberStatusReports ?? []).find((r) => r.id === priorId);
      if (existing) {
        const contextVersion = await this.resolveContextVersion(tripId);
        return {
          ...this.toReportDto(
            existing,
            members,
            userId,
            canManage,
            driverIdEarly,
            contextVersion,
          ),
          replay: true,
        };
      }
    }

    const driverId = driverIdEarly;
    const isSubjectDriver = subjectMemberId === driverId;
    const priority = resolveReportPriority({
      needCode: body.needCode,
      isSubjectDriver,
    });
    const now = new Date().toISOString();
    const resolvedPlace = await this.resolveSuggestionPlace(tripId, body);
    const suggestion = projectMemberSuggestion({
      needCode: body.needCode,
      priority,
      resolvedPlace,
    });

    // CAN_CONTINUE: resolve similar open reports for subject
    if (body.needCode === 'CAN_CONTINUE') {
      for (const r of mobile.memberStatusReports ?? []) {
        if (
          r.subjectMemberId === subjectMemberId &&
          isOpenLifecycle(r.lifecycleStatus) &&
          r.needCode !== 'CAN_CONTINUE'
        ) {
          r.lifecycleStatus = 'RESOLVED';
          r.updatedAt = now;
          r.timeline.push({
            at: now,
            toStatus: 'RESOLVED',
            byMemberId: userId,
            note: 'CAN_CONTINUE 自动关闭',
          });
        }
      }
    }

    const id = `msr-${randomUUID()}`;
    const stored: StoredMemberStatusReport = {
      id,
      needCode: body.needCode,
      lifecycleStatus: body.needCode === 'CAN_CONTINUE' ? 'RESOLVED' : 'REPORTED',
      priority,
      source: body.source,
      subjectMemberId,
      reporterMemberId: userId,
      note: body.note ?? null,
      reportedAt: now,
      updatedAt: now,
      clientContext: body.clientContext,
      suggestion,
      arrangement: null,
      itineraryImpact: {
        affectsHardWindow: false,
      },
      timeline: [
        {
          at: now,
          toStatus: body.needCode === 'CAN_CONTINUE' ? 'RESOLVED' : 'REPORTED',
          byMemberId: userId,
        },
      ],
    };

    mobile.memberStatusReports = [...(mobile.memberStatusReports ?? []), stored];
    idempotencyKeys[opts.idempotencyKey!] = `msr::${id}`;
    mobile.idempotencyKeys = idempotencyKeys;
    await this.saveMobileMeta(tripId, mobile);

    const contextVersion = await this.resolveContextVersion(tripId);
    this.notify(tripId, contextVersion, ['member_status', 'execution']);

    return this.toReportDto(
      stored,
      members,
      userId,
      canManage,
      driverId,
      contextVersion,
    );
  }

  async transitionMemberStatusReport(
    tripId: string,
    userId: string,
    reportId: string,
    body: TransitionMemberStatusBody,
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<MemberStatusReportDto> {
    this.requireIdempotencyKey(opts.idempotencyKey);
    if (opts.ifMatch != null) {
      await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);
    }

    await this.access.assertTripMember(tripId, userId);
    const members = await this.loadMembers(tripId);
    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);
    const canManage = role.canManageTrip || role.isCurrentDriver;
    const mobile = await this.loadMobileMeta(tripId);
    await this.expireStaleReports(tripId, mobile, false);

    const idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}) };
    const prior = idempotencyKeys[opts.idempotencyKey!];
    if (prior?.startsWith(`msr-tx::${reportId}::`)) {
      const row = (mobile.memberStatusReports ?? []).find((r) => r.id === reportId);
      if (row) {
        const contextVersion = await this.resolveContextVersion(tripId);
        return {
          ...this.toReportDto(
            row,
            members,
            userId,
            canManage,
            driverId,
            contextVersion,
          ),
          replay: true,
        };
      }
    }

    const reports = mobile.memberStatusReports ?? [];
    const idx = reports.findIndex((r) => r.id === reportId);
    if (idx < 0) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `报告 ${reportId} 不存在`,
      });
    }
    const row = reports[idx]!;

    if (isTerminalLifecycle(row.lifecycleStatus)) {
      throw new ConflictException({
        code: 'REPORT_ALREADY_TERMINAL',
        message: '报告已结束，请刷新详情',
      });
    }

    const toStatus = body?.toStatus;
    if (
      toStatus !== 'TEAM_AWARE' &&
      toStatus !== 'ARRANGED' &&
      toStatus !== 'RESOLVED' &&
      toStatus !== 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '非法 toStatus',
      });
    }

    if (!canTransitionLifecycle(row.lifecycleStatus, toStatus)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `不允许从 ${row.lifecycleStatus} 转到 ${toStatus}`,
      });
    }

    const allowed = filterAllowedTransitionsForViewer({
      from: row.lifecycleStatus,
      viewerUserId: userId,
      subjectMemberId: row.subjectMemberId,
      canManageTrip: canManage,
    });
    if (!allowed.includes(toStatus)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '无权执行该状态流转',
      });
    }

    const now = new Date().toISOString();
    if (toStatus === 'ARRANGED') {
      if (!body.arrangement?.summaryZh?.trim()) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'ARRANGED 建议带 arrangement.summaryZh',
        });
      }
      row.arrangement = buildArrangementFromBody(
        body.arrangement,
        userId,
        now,
      );
    }

    row.lifecycleStatus = toStatus;
    row.updatedAt = now;
    row.timeline.push({
      at: now,
      toStatus,
      byMemberId: userId,
      note: body.note ?? null,
    });

    // P1 hook: stillNeedsHelp kept as note only in P0
    if (toStatus === 'RESOLVED' && body.stillNeedsHelp === true) {
      row.timeline[row.timeline.length - 1]!.note =
        (body.note ? `${body.note}; ` : '') + '仍需要帮助（P1 可升 NEED_HELP）';
    }

    reports[idx] = row;
    mobile.memberStatusReports = reports;
    idempotencyKeys[opts.idempotencyKey!] = `msr-tx::${reportId}::${toStatus}`;
    mobile.idempotencyKeys = idempotencyKeys;
    await this.saveMobileMeta(tripId, mobile);

    const contextVersion = await this.resolveContextVersion(tripId);
    this.notify(tripId, contextVersion, ['member_status', 'execution']);

    return this.toReportDto(
      row,
      members,
      userId,
      canManage,
      driverId,
      contextVersion,
    );
  }

  async createTripFieldReport(
    tripId: string,
    userId: string,
    body: CreateTripFieldReportBody,
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<TripFieldReportResponseDto> {
    this.requireIdempotencyKey(opts.idempotencyKey);
    if (opts.ifMatch != null) {
      await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);
    }

    await this.access.assertTripMember(tripId, userId);
    const members = await this.loadMembers(tripId);
    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);
    if (!(role.canManageTrip || role.isCurrentDriver)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '仅领队/驾驶员/授权成员可提交行程操作',
      });
    }

    const actionCode = body?.actionCode as TripActionCode;
    if (!actionCode || typeof actionCode !== 'string') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'actionCode 必填',
      });
    }

    if (actionCode === 'ROAD_MISMATCH') {
      const issue = body.payload?.roadIssue;
      if (
        issue !== 'CLOSED' &&
        issue !== 'SNOW' &&
        issue !== 'POOR_SURFACE' &&
        issue !== 'IMPASSABLE'
      ) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'ROAD_MISMATCH 需要合法 roadIssue',
        });
      }
    }

    const mobile = await this.loadMobileMeta(tripId);
    const idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}) };
    const prior = idempotencyKeys[opts.idempotencyKey!];
    if (prior?.startsWith('tfr::')) {
      const priorId = prior.slice('tfr::'.length);
      if (priorId === 'nav-only') {
        const projected = projectTripFieldFollowUp(actionCode, body.payload);
        const contextVersion = await this.resolveContextVersion(tripId);
        return {
          reportId: null,
          acknowledged: true,
          worldStateUpdated: projected.worldStateUpdated,
          suggestion: projected.suggestion,
          itineraryImpact: { affectsHardWindow: false },
          followUp: projected.followUp,
          navigation:
            projected.followUp.type === 'OPEN_ADJUSTMENT_QUEUE'
              ? { type: 'OPEN_ADJUSTMENT_QUEUE', itemId: projected.followUp.itemId }
              : undefined,
          contextVersion,
          replay: true,
        };
      }
      const existing = (mobile.tripFieldReports ?? []).find((r) => r.id === priorId);
      if (existing) {
        const projected = projectTripFieldFollowUp(existing.actionCode, existing.payload);
        const contextVersion = await this.resolveContextVersion(tripId);
        return {
          reportId: existing.id,
          acknowledged: true,
          worldStateUpdated: projected.worldStateUpdated,
          suggestion: projected.suggestion,
          itineraryImpact: existing.itineraryImpact ?? {
            affectsHardWindow: false,
          },
          followUp: projected.followUp,
          contextVersion,
          replay: true,
        };
      }
    }

    const projected = projectTripFieldFollowUp(actionCode, body.payload);
    let adjustmentQueueItemId: string | undefined;
    let itineraryImpact = {
      affectsHardWindow: projected.affectsHardWindow,
      hardWindowLabelZh: projected.hardWindowLabelZh,
      requiresUserConfirm: projected.affectsHardWindow,
      adjustmentQueueItemId: undefined as string | undefined,
    };

    let reportId: string | null = null;
    if (projected.createReport) {
      reportId = `tfr-${randomUUID()}`;
      if (projected.affectsHardWindow) {
        adjustmentQueueItemId = `adj-local-${randomUUID()}`;
        itineraryImpact = {
          ...itineraryImpact,
          adjustmentQueueItemId,
        };
        mobile.localAdjustmentItems = [
          ...(mobile.localAdjustmentItems ?? []),
          {
            id: adjustmentQueueItemId,
            labelZh: projected.hardWindowLabelZh ?? '行程调整确认',
            createdAt: new Date().toISOString(),
            sourceReportId: reportId,
          },
        ];
      }

      const stored: StoredTripFieldReport = {
        id: reportId,
        actionCode,
        payload: body.payload,
        reportedByMemberId: userId,
        reportedAt: new Date().toISOString(),
        clientContext: body.clientContext,
        itineraryImpact,
      };
      mobile.tripFieldReports = [...(mobile.tripFieldReports ?? []), stored];
      idempotencyKeys[opts.idempotencyKey!] = `tfr::${reportId}`;

      const tz = DEFAULT_TRIP_DISPLAY_TIMEZONE;
      const localDate =
        DateTime.now().setZone(tz).toISODate() ??
        new Date().toISOString().slice(0, 10);
      const nextDrive = applyFieldReportToDriveSession({
        prev: mobile.driveSession ?? null,
        localDate,
        actionCode,
        reportedAt: stored.reportedAt,
        memberId: userId,
      });
      if (nextDrive) mobile.driveSession = nextDrive;
    } else {
      idempotencyKeys[opts.idempotencyKey!] = 'tfr::nav-only';
      if (projected.followUp.type === 'OPEN_ADJUSTMENT_QUEUE') {
        projected.followUp = { ...projected.followUp };
      }
    }

    mobile.idempotencyKeys = idempotencyKeys;
    await this.saveMobileMeta(tripId, mobile);

    const contextVersion = await this.resolveContextVersion(tripId);
    const sections: TripContextChangedSection[] = ['execution', 'overview_dashboard'];
    if (projected.affectsHardWindow) sections.push('adjustment_queue');
    this.notify(tripId, contextVersion, sections);

    return {
      reportId,
      acknowledged: true,
      worldStateUpdated: projected.worldStateUpdated,
      suggestion: projected.suggestion,
      itineraryImpact,
      followUp: {
        ...projected.followUp,
        itemId: adjustmentQueueItemId ?? projected.followUp.itemId,
      },
      navigation:
        projected.followUp.type === 'OPEN_ADJUSTMENT_QUEUE'
          ? {
              type: 'OPEN_ADJUSTMENT_QUEUE',
              itemId: adjustmentQueueItemId,
            }
          : undefined,
      contextVersion,
      replay: false,
    };
  }

  /** P1 stub: resolve trip field report */
  async resolveTripFieldReport(
    tripId: string,
    userId: string,
    reportId: string,
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<{ reportId: string; resolved: boolean; contextVersion: number; replay?: boolean }> {
    this.requireIdempotencyKey(opts.idempotencyKey);
    if (opts.ifMatch != null) {
      await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);
    }
    await this.access.assertTripMember(tripId, userId);
    const members = await this.loadMembers(tripId);
    const driverId = await this.resolveCurrentDriverId(tripId, members);
    const role = this.resolveViewerRole(userId, members, driverId);
    if (!(role.canManageTrip || role.isCurrentDriver)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '无权关闭行程现场报告' });
    }

    const mobile = await this.loadMobileMeta(tripId);
    const idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}) };
    if (idempotencyKeys[opts.idempotencyKey!] === `tfr-resolve::${reportId}`) {
      const contextVersion = await this.resolveContextVersion(tripId);
      return { reportId, resolved: true, contextVersion, replay: true };
    }

    const row = (mobile.tripFieldReports ?? []).find((r) => r.id === reportId);
    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `行程现场报告 ${reportId} 不存在`,
      });
    }
    row.resolvedAt = new Date().toISOString();
    idempotencyKeys[opts.idempotencyKey!] = `tfr-resolve::${reportId}`;
    mobile.idempotencyKeys = idempotencyKeys;
    await this.saveMobileMeta(tripId, mobile);
    const contextVersion = await this.resolveContextVersion(tripId);
    this.notify(tripId, contextVersion, ['execution']);
    return { reportId, resolved: true, contextVersion };
  }

  // ── helpers ──────────────────────────────────────────────

  private requireIdempotencyKey(key?: string) {
    if (!key?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
  }

  private toReportDto(
    row: StoredMemberStatusReport,
    members: MemberLite[],
    viewerUserId: string,
    canManageTrip: boolean,
    _driverId: string | null,
    contextVersion: number,
  ): MemberStatusReportDto {
    const subject = members.find((m) => m.id === row.subjectMemberId);
    const reporter = members.find((m) => m.id === row.reporterMemberId);
    const subjectName = subject?.displayName ?? '成员';
    const reporterName = reporter?.displayName ?? '成员';
    const needLabelZh = NEED_LABEL_ZH[row.needCode];

    return {
      id: row.id,
      needCode: row.needCode,
      needLabelZh,
      lifecycleStatus: row.lifecycleStatus,
      lifecycleLabelZh: LIFECYCLE_LABEL_ZH[row.lifecycleStatus],
      priority: row.priority,
      source: row.source,
      subject: {
        memberId: row.subjectMemberId,
        displayName: subjectName,
        avatarUrl: subject?.avatarUrl ?? null,
      },
      reporter: {
        memberId: row.reporterMemberId,
        displayName: reporterName,
        avatarUrl: reporter?.avatarUrl ?? null,
      },
      sourceLabelZh: buildSourceLabelZh({
        source: row.source,
        subjectName,
        reporterName,
        needLabelZh,
      }),
      note: row.note,
      reportedAt: row.reportedAt,
      updatedAt: row.updatedAt,
      suggestion: row.suggestion ?? null,
      arrangement: row.arrangement ?? null,
      itineraryImpact: row.itineraryImpact ?? { affectsHardWindow: false },
      timeline: row.timeline,
      allowedTransitions: filterAllowedTransitionsForViewer({
        from: row.lifecycleStatus,
        viewerUserId,
        subjectMemberId: row.subjectMemberId,
        canManageTrip,
      }),
      contextVersion,
    };
  }

  private resolveViewerRole(
    userId: string,
    members: MemberLite[],
    driverId: string | null,
  ) {
    const me = members.find((m) => m.id === userId);
    const isOrganizer = me?.collabRole === 'OWNER';
    const isLeader =
      me?.collabRole === 'OWNER' || me?.collabRole === 'EDITOR' || false;
    const isCurrentDriver = !!driverId && driverId === userId;
    const canManageTrip = isLeader || isCurrentDriver;
    const canProxyReport = isLeader || isCurrentDriver;
    return {
      isLeader,
      isOrganizer,
      isCurrentDriver,
      canManageTrip,
      canProxyReport,
    };
  }

  private async resolveCurrentDriverId(
    tripId: string,
    members: MemberLite[],
  ): Promise<string | null> {
    const mobile = await this.loadMobileMeta(tripId);
    const byDate = mobile.dailyDrive?.byLocalDate ?? {};
    const dates = Object.keys(byDate).sort().reverse();
    for (const d of dates) {
      const driver = byDate[d]?.payload?.driverMemberId;
      if (driver) return driver;
    }
    const sorted = [...members].sort((a, b) => {
      const rank = (role: string) =>
        role === 'OWNER' ? 0 : role === 'EDITOR' ? 1 : 2;
      return rank(a.collabRole) - rank(b.collabRole);
    });
    return sorted[0]?.id ?? null;
  }

  private async resolveScene(
    tripId: string,
    userId: string,
  ): Promise<'DRIVING' | 'AT_POI' | 'DELAY_RISK'> {
    let hasDelayRisk = false;
    let atPoi = false;
    try {
      const alerts = await this.mobileRead.getExecutionAlerts(tripId, userId);
      const primary = alerts?.primaryRisk;
      if (
        primary?.requiresImmediateAttention ||
        primary?.level === 'STOP' ||
        primary?.level === 'REPLAN_REQUIRED' ||
        /延误|delay|late/i.test(`${primary?.title ?? ''} ${primary?.riskType ?? ''}`)
      ) {
        hasDelayRisk = true;
      }
    } catch {
      // degrade
    }
    // P0: AT_POI 启发式 — presence / 行程态完整接入前默认非到点
    void atPoi;
    return resolveQuickActionsScene({ hasDelayRisk, atPoi: false });
  }

  private async expireStaleReports(
    tripId: string,
    mobile: MobileMetaBag,
    persist = true,
  ): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const r of mobile.memberStatusReports ?? []) {
      if (!isOpenLifecycle(r.lifecycleStatus)) continue;
      const reportedMs = Date.parse(r.reportedAt);
      if (!Number.isFinite(reportedMs)) continue;
      if (now - reportedMs > MEMBER_STATUS_REPORT_TTL_MS) {
        const at = new Date().toISOString();
        r.lifecycleStatus = 'CANCELLED';
        r.updatedAt = at;
        r.timeline.push({
          at,
          toStatus: 'CANCELLED',
          byMemberId: 'system',
          note: '超过 TTL 自动取消',
        });
        changed = true;
      }
    }
    if (changed && persist) {
      await this.saveMobileMeta(tripId, mobile);
    }
  }

  private async resolveSuggestionPlace(
    tripId: string,
    body: CreateMemberStatusReportBody,
  ): Promise<{
    placeId: string;
    placeNameZh: string;
    etaMinutes?: number;
    detourMinutes?: number;
    kind?: CorridorPoiHit['kind'];
  } | null> {
    const need = body.needCode;
    if (
      need !== 'NEED_TOILET' &&
      need !== 'NEED_REST' &&
      need !== 'CARSICK' &&
      need !== 'UNWELL' &&
      need !== 'HUNGRY' &&
      need !== 'NEED_HELP' &&
      need !== 'TOO_COLD'
    ) {
      return null;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { startDate: true, endDate: true, metadata: true },
    });
    if (!trip) return null;

    const meta =
      trip.metadata && typeof trip.metadata === 'object'
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const tzRaw = meta.timezone ?? meta.timeZone ?? meta.displayTimezone;
    const timezone =
      typeof tzRaw === 'string' && tzRaw.trim()
        ? tzRaw.trim()
        : DEFAULT_TRIP_DISPLAY_TIMEZONE;
    const localDate =
      DateTime.now().setZone(timezone).toISODate() ??
      new Date().toISOString().slice(0, 10);

    const lat = body.clientContext?.lat;
    const lng = body.clientContext?.lng;

    let hit: CorridorPoiHit | undefined;
    try {
      // PrismaService ↔ corridor util 解耦（避免 generated findMany 泛型摩擦）
      const db = this.prisma as Parameters<typeof resolveNextSafeParking>[0];
      if (need === 'NEED_TOILET') {
        hit = await resolveNextToiletOrParking(db, { lat, lng });
      } else if (need === 'HUNGRY') {
        hit = await resolveNextFuelAlongCorridor(db, {
          tripId,
          startDate: trip.startDate,
          endDate: trip.endDate,
          timezone,
          localDate,
        });
        if (hit) hit = { ...hit, kind: 'food' };
      } else {
        hit = await resolveNextSafeParking(db, { lat, lng });
      }
    } catch {
      return null;
    }

    if (!hit) return null;
    return {
      placeId: hit.placeId,
      placeNameZh: hit.placeNameZh,
      etaMinutes: hit.durationMin,
      detourMinutes: Math.min(8, Math.max(2, Math.round(hit.distanceKm / 10))),
      kind: hit.kind,
    };
  }

  private async loadMembers(tripId: string): Promise<MemberLite[]> {
    const rows = await this.prisma.tripCollaborator.findMany({ where: { tripId } });
    const userIds = rows.map((r) => r.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return rows.map((row) => {
      const u = userMap.get(row.userId);
      return {
        id: row.userId,
        displayName: u?.displayName ?? u?.email?.split('@')[0] ?? '成员',
        avatarUrl: u?.avatarUrl ?? null,
        collabRole: row.role,
      };
    });
  }

  private async resolveContextVersion(tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const meta = (trip.metadata as Record<string, unknown>) ?? {};
    const constraintsVersion =
      typeof meta.constraintsVersion === 'number' ? meta.constraintsVersion : 1;
    return computeMobileContextVersion({
      constraintsVersion,
      tripUpdatedAt: trip.updatedAt,
    });
  }

  private async loadMobileMeta(tripId: string): Promise<MobileMetaBag> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    return ((metadata.mobileExecution as MobileMetaBag) ?? {}) as MobileMetaBag;
  }

  private async saveMobileMeta(tripId: string, mobile: MobileMetaBag) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          mobileExecution: mobile,
        }),
      },
    });
  }

  private notify(
    tripId: string,
    contextVersion: number,
    changedSections: TripContextChangedSection[],
  ) {
    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections,
    });
  }
}
