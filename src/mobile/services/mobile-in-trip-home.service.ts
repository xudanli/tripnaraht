import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { loadIcelandDriveRunbook } from '../../decision-runtime/packs/knowledge/runbooks/iceland-drive-runbook.loader';
import type { IcelandDriveRunbookCandidateOp } from '../../decision-runtime/packs/knowledge/runbooks/iceland-drive-runbook.types';
import { computeMobileContextVersion } from '../utils/mobile-execution.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { MobileExecutionService } from './mobile-execution.service';
import { MobileExecutionWriteService } from './mobile-execution-write.service';
import {
  EXECUTION_RUNBOOK_SCHEMA_ID,
  RUNBOOK_TRIGGER_TITLES_ZH,
  VERIFIED_PROPOSAL_SCHEMA_ID,
  type ApplyVerifiedProposalResponseDto,
  type ConfirmReasonCode,
  type DeferRunbookResponseDto,
  type AcknowledgeRunbookResponseDto,
  type DismissInlineReminderResponseDto,
  type ExecutionRunbookDto,
  type InTripHomeDto,
  type InTripHomeMetadata,
  type RunbookOptionDto,
  type RunbookTrigger,
  type StoredRunbookState,
  type StoredVerifiedProposal,
  type VerifiedProposalDto,
} from '../dto/mobile-in-trip-home.types';
import {
  buildActiveRunbookSummary,
  buildProposalId,
  buildRunbookId,
  confirmReasonsZhFor,
  inferRunbookTrigger,
  pickRunbookSourceAlert,
  projectInlineReminder,
  projectInTripHome,
  requiresUserConfirmFromReasons,
} from '../utils/in-trip-home.projection.util';
import {
  formatFuelTrailingZh,
  formatParkingTrailingZh,
  resolveNextFuelAlongCorridor,
  resolveNextSafeParking,
} from '../utils/execution-corridor-poi.util';
import { DEFAULT_TRIP_DISPLAY_TIMEZONE } from '../../common/utils/format-clock-label.util';
import { DateTime } from 'luxon';

interface MobileMetaWithInTrip {
  inTripHome?: InTripHomeMetadata;
  idempotencyKeys?: Record<string, string>;
  [key: string]: unknown;
}

const OP_LABELS_ZH: Record<IcelandDriveRunbookCandidateOp, { title: string; subtitle: string }> = {
  REROUTE: { title: '改道绕行', subtitle: '避开受阻路段，沿替代公路继续' },
  REMOVE: { title: '取消受影响活动', subtitle: '删除无法按时抵达的行程项' },
  SWAP: { title: '对调行程顺序', subtitle: '先完成仍可达的活动' },
  END_DAY_EARLY: { title: '提前结束当日行程', subtitle: '就近安全停车并调整住宿计划' },
  SHORTEN: { title: '压缩停留时间', subtitle: '缩短后续停留以追赶时间窗' },
  SHIFT: { title: '整体后移时间', subtitle: '平移后续行程时间表' },
  ADD_STOP: { title: '增加中途停靠', subtitle: '加入加油或安全停车点' },
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

@Injectable()
export class MobileInTripHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly mobileRead: MobileExecutionService,
    private readonly mobileWrite: MobileExecutionWriteService,
    private readonly contextNotifier: TripContextChangeNotifierService,
  ) {}

  async getInTripHome(
    tripId: string,
    userId: string,
    opts?: { includeReminder?: boolean; includeActiveRunbook?: boolean },
  ): Promise<InTripHomeDto> {
    await this.access.assertTripMember(tripId, userId);
    return this.buildHome(tripId, userId, {
      includeReminder: opts?.includeReminder !== false,
      includeActiveRunbook: opts?.includeActiveRunbook !== false,
      persistRunbook: true,
    });
  }

  async getRunbook(
    tripId: string,
    userId: string,
    runbookId: string,
  ): Promise<ExecutionRunbookDto> {
    await this.access.assertTripMember(tripId, userId);
    await this.buildHome(tripId, userId, {
      includeReminder: true,
      includeActiveRunbook: true,
      persistRunbook: true,
    });

    const mobile = await this.loadMobileMeta(tripId);
    const stored = mobile.inTripHome?.runbooksById?.[runbookId];
    if (!stored || stored.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'RUNBOOK_NOT_ACTIVE',
        message: `Runbook ${runbookId} 已关闭或不存在`,
      });
    }

    const contextVersion = await this.resolveContextVersion(tripId);
    return this.toRunbookDto(stored, contextVersion);
  }

  async getVerifiedProposal(
    tripId: string,
    userId: string,
    proposalId: string,
  ): Promise<VerifiedProposalDto> {
    await this.access.assertTripMember(tripId, userId);
    await this.buildHome(tripId, userId, {
      includeReminder: true,
      includeActiveRunbook: true,
      persistRunbook: true,
    });

    const mobile = await this.loadMobileMeta(tripId);
    const stored = mobile.inTripHome?.proposalsById?.[proposalId];
    if (!stored) {
      throw new NotFoundException(`Verified Proposal ${proposalId} 不存在`);
    }
    if (stored.status === 'EXPIRED' || this.isProposalExpired(stored)) {
      throw new BadRequestException({
        code: 'PROPOSAL_EXPIRED',
        message: '提案已失效，请重新打开 Runbook',
      });
    }

    const contextVersion = await this.resolveContextVersion(tripId);
    return this.toProposalDto(stored, contextVersion);
  }

  async applyVerifiedProposal(
    tripId: string,
    userId: string,
    proposalId: string,
    body: { acknowledged?: boolean; clientObservedAt?: string; optionId?: string },
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<ApplyVerifiedProposalResponseDto> {
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }
    if (body.acknowledged !== true) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'acknowledged 必须为 true',
      });
    }

    await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);

    const mobile = await this.loadMobileMeta(tripId);
    const inTrip = this.ensureInTripMeta(mobile);
    const idemKey = opts.idempotencyKey.trim();
    const prior = inTrip.idempotencyKeys?.[idemKey];
    if (prior?.startsWith('apply::')) {
      const priorProposalId = prior.slice('apply::'.length);
      const priorProposal = inTrip.proposalsById?.[priorProposalId];
      if (priorProposal?.status === 'APPLIED') {
        const home = await this.buildHome(tripId, userId, {
          includeReminder: true,
          includeActiveRunbook: true,
          persistRunbook: false,
        });
        return {
          proposalId: priorProposal.proposalId,
          applied: true,
          appliedAt: priorProposal.appliedAt!,
          contextVersion: home.contextVersion ?? (await this.resolveContextVersion(tripId)),
          replay: true,
          inTripHome: home,
          appliedProposal: inTrip.appliedProposal,
        };
      }
    }

    let proposal = inTrip.proposalsById?.[proposalId];
    if (!proposal) {
      await this.buildHome(tripId, userId, {
        includeReminder: true,
        includeActiveRunbook: true,
        persistRunbook: true,
      });
      const refreshed = await this.loadMobileMeta(tripId);
      proposal = refreshed.inTripHome?.proposalsById?.[proposalId];
      Object.assign(mobile, refreshed);
      Object.assign(inTrip, this.ensureInTripMeta(mobile));
    }

    if (!proposal) {
      throw new NotFoundException(`Verified Proposal ${proposalId} 不存在`);
    }
    if (proposal.status === 'EXPIRED' || this.isProposalExpired(proposal)) {
      throw new BadRequestException({
        code: 'PROPOSAL_EXPIRED',
        message: '提案已失效，请重新打开 Runbook',
      });
    }
    if (body.optionId && body.optionId !== proposal.optionId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'optionId 与提案不匹配',
      });
    }

    const appliedAt = new Date().toISOString();
    proposal.status = 'APPLIED';
    proposal.appliedAt = appliedAt;
    proposal.appliedByMemberId = userId;
    inTrip.proposalsById![proposalId] = proposal;

    const runbook = inTrip.runbooksById?.[proposal.runbookId];
    if (runbook) {
      runbook.status = 'CLOSED';
      inTrip.runbooksById![proposal.runbookId] = runbook;
    }

    const appliedProposal = {
      proposalId,
      titleZh: `已采用${proposal.optionLetter ? `方案 ${proposal.optionLetter}` : '方案'}`,
      detailZh: proposal.titleZh,
      appliedAt,
    };
    inTrip.appliedProposal = appliedProposal;
    inTrip.idempotencyKeys = {
      ...(inTrip.idempotencyKeys ?? {}),
      [idemKey]: `apply::${proposalId}`,
    };
    mobile.inTripHome = inTrip;
    await this.saveMobileMeta(tripId, mobile);

    const home = await this.buildHome(tripId, userId, {
      includeReminder: true,
      includeActiveRunbook: true,
      persistRunbook: false,
    });
    const contextVersion = home.contextVersion ?? (await this.resolveContextVersion(tripId));

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections: ['in_trip_home', 'execution', 'overview_dashboard'],
    });

    return {
      proposalId,
      applied: true,
      appliedAt,
      contextVersion,
      replay: false,
      inTripHome: home,
      appliedProposal,
    };
  }

  async dismissInlineReminder(
    tripId: string,
    userId: string,
    reminderId: string,
    _body: { clientObservedAt?: string },
    opts: { idempotencyKey?: string },
  ): Promise<DismissInlineReminderResponseDto> {
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }

    await this.access.assertTripMember(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    const inTrip = this.ensureInTripMeta(mobile);
    const idemKey = opts.idempotencyKey.trim();

    if (inTrip.idempotencyKeys?.[idemKey] === `dismiss::${reminderId}`) {
      return {
        dismissed: true,
        reminderId,
        replay: true,
        contextVersion: await this.resolveContextVersion(tripId),
      };
    }

    const byUser = { ...(inTrip.dismissedReminderIdsByUser ?? {}) };
    const list = new Set(byUser[userId] ?? []);
    list.add(reminderId);
    byUser[userId] = [...list];
    inTrip.dismissedReminderIdsByUser = byUser;
    inTrip.idempotencyKeys = {
      ...(inTrip.idempotencyKeys ?? {}),
      [idemKey]: `dismiss::${reminderId}`,
    };
    mobile.inTripHome = inTrip;
    await this.saveMobileMeta(tripId, mobile);

    const contextVersion = await this.resolveContextVersion(tripId);
    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections: ['in_trip_home', 'execution', 'overview_dashboard'],
    });

    return {
      dismissed: true,
      reminderId,
      replay: false,
      contextVersion,
    };
  }

  async deferRunbook(
    tripId: string,
    userId: string,
    runbookId: string,
    _body: { clientObservedAt?: string },
    opts: { idempotencyKey?: string },
  ): Promise<DeferRunbookResponseDto> {
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
    await this.access.assertTripMember(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    const inTrip = this.ensureInTripMeta(mobile);
    const idemKey = opts.idempotencyKey.trim();

    if (inTrip.idempotencyKeys?.[idemKey] === `defer::${runbookId}`) {
      const home = await this.buildHome(tripId, userId, {
        includeReminder: true,
        includeActiveRunbook: true,
        persistRunbook: false,
      });
      return {
        deferred: true,
        runbookId,
        replay: true,
        contextVersion: home.contextVersion ?? (await this.resolveContextVersion(tripId)),
        inTripHome: home,
      };
    }

    const stored = inTrip.runbooksById?.[runbookId];
    if (!stored || stored.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'RUNBOOK_NOT_ACTIVE',
        message: `Runbook ${runbookId} 已关闭或不存在`,
      });
    }

    const deferredAt = new Date().toISOString();
    stored.status = 'DEFERRED';
    stored.deferredAt = deferredAt;
    inTrip.runbooksById![runbookId] = stored;
    inTrip.idempotencyKeys = {
      ...(inTrip.idempotencyKeys ?? {}),
      [idemKey]: `defer::${runbookId}`,
    };
    mobile.inTripHome = inTrip;
    await this.saveMobileMeta(tripId, mobile);

    const home = await this.buildHome(tripId, userId, {
      includeReminder: true,
      includeActiveRunbook: true,
      persistRunbook: false,
    });
    const contextVersion = home.contextVersion ?? (await this.resolveContextVersion(tripId));
    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections: ['in_trip_home', 'execution', 'overview_dashboard'],
    });

    return {
      deferred: true,
      runbookId,
      replay: false,
      contextVersion,
      inTripHome: home,
    };
  }

  async acknowledgeRunbook(
    tripId: string,
    userId: string,
    runbookId: string,
    _body: { clientObservedAt?: string },
    opts: { idempotencyKey?: string },
  ): Promise<AcknowledgeRunbookResponseDto> {
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
    await this.access.assertTripMember(tripId, userId);
    const mobile = await this.loadMobileMeta(tripId);
    const inTrip = this.ensureInTripMeta(mobile);
    const idemKey = opts.idempotencyKey.trim();

    if (inTrip.idempotencyKeys?.[idemKey] === `ack::${runbookId}`) {
      const home = await this.buildHome(tripId, userId, {
        includeReminder: true,
        includeActiveRunbook: true,
        persistRunbook: false,
      });
      return {
        acknowledged: true,
        runbookId,
        replay: true,
        contextVersion: home.contextVersion ?? (await this.resolveContextVersion(tripId)),
        inTripHome: home,
      };
    }

    const stored = inTrip.runbooksById?.[runbookId];
    if (!stored || stored.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'RUNBOOK_NOT_ACTIVE',
        message: `Runbook ${runbookId} 已关闭或不存在`,
      });
    }

    const acknowledgedAt = new Date().toISOString();
    stored.status = 'ACKNOWLEDGED';
    stored.acknowledgedAt = acknowledgedAt;
    inTrip.runbooksById![runbookId] = stored;
    inTrip.idempotencyKeys = {
      ...(inTrip.idempotencyKeys ?? {}),
      [idemKey]: `ack::${runbookId}`,
    };
    mobile.inTripHome = inTrip;
    await this.saveMobileMeta(tripId, mobile);

    const home = await this.buildHome(tripId, userId, {
      includeReminder: true,
      includeActiveRunbook: true,
      persistRunbook: false,
    });
    const contextVersion = home.contextVersion ?? (await this.resolveContextVersion(tripId));
    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections: ['in_trip_home', 'execution', 'overview_dashboard'],
    });

    return {
      acknowledged: true,
      runbookId,
      replay: false,
      contextVersion,
      inTripHome: home,
    };
  }

  private async buildHome(
    tripId: string,
    userId: string,
    opts: {
      includeReminder: boolean;
      includeActiveRunbook: boolean;
      persistRunbook: boolean;
    },
  ): Promise<InTripHomeDto> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const contextVersion = await this.resolveContextVersion(tripId, trip.updatedAt);
    const mobile = await this.loadMobileMeta(tripId);
    const inTrip = this.ensureInTripMeta(mobile);

    const timezone = this.resolveTimezone(trip.metadata);
    const localDate =
      DateTime.now().setZone(timezone).toISODate() ??
      new Date().toISOString().slice(0, 10);

    const [alerts, road, overview, liveRoute, itinerary, fuelHit] =
      await Promise.all([
        this.mobileRead.getExecutionAlerts(tripId, userId).catch(() => null),
        this.mobileRead.getRoadConditions(tripId, userId).catch(() => null),
        this.mobileRead.getExecutionOverview(tripId, userId).catch(() => null),
        this.mobileRead.getLiveRoute(tripId, userId).catch(() => null),
        this.mobileRead.getTodayItinerary(tripId, userId).catch(() => null),
        resolveNextFuelAlongCorridor(this.prisma, {
          tripId,
          startDate: trip.startDate,
          endDate: trip.endDate,
          timezone,
          localDate,
        }).catch(() => undefined),
      ]);

    const origin = this.resolveOriginLatLng(liveRoute, itinerary);
    const parkingHit = await resolveNextSafeParking(this.prisma, {
      lat: origin?.lat,
      lng: origin?.lng,
      roadId: road?.plowRoadSegmentId,
    }).catch(() => undefined);

    const sourceAlert = pickRunbookSourceAlert(alerts);
    let activeRunbook = null as ReturnType<typeof buildActiveRunbookSummary>;
    if (sourceAlert) {
      const trigger = inferRunbookTrigger(sourceAlert);
      if (trigger) {
        const runbookId = buildRunbookId(trigger, sourceAlert.riskId ?? sourceAlert.id);
        const existing = inTrip.runbooksById?.[runbookId];
        const suppressedForSameRisk =
          existing != null &&
          existing.status !== 'ACTIVE' &&
          existing.relatedRiskId === (sourceAlert.riskId ?? sourceAlert.id);

        if (!suppressedForSameRisk) {
          activeRunbook = buildActiveRunbookSummary(sourceAlert, runbookId);

          if (opts.persistRunbook && activeRunbook) {
            await this.ensureRunbookPersisted(
              tripId,
              mobile,
              activeRunbook.trigger,
              runbookId,
              sourceAlert,
              activeRunbook.severity,
              itinerary,
            );
          }
        }
      }
    }

    const metaFuelKm = this.estimateNextFuelKm(trip.metadata);
    const fuelKm = fuelHit?.distanceKm ?? metaFuelKm;
    const hardWindow = this.resolveHardWindow(itinerary, overview);
    const dismissed = inTrip.dismissedReminderIdsByUser?.[userId] ?? [];

    const restSuggested = this.inferRestSuggested(liveRoute?.remaining);
    const sunsetBufferDrop = this.inferSunsetFromAlerts(alerts);
    const fuelSuggested = fuelKm != null && fuelKm <= 60 && !activeRunbook;
    const windIncreased =
      !activeRunbook &&
      !!alerts?.primaryRisk &&
      /wind|风/.test(
        `${alerts.primaryRisk.riskType ?? ''} ${alerts.primaryRisk.title}`.toLowerCase(),
      ) &&
      !sourceAlert;

    const inlineReminder = projectInlineReminder({
      alerts,
      activeRunbook,
      restSuggested,
      sunsetBufferDrop,
      fuelSuggested,
      windIncreased,
      dismissedReminderIds: dismissed,
    });

    const destZh =
      overview?.currentActivity?.title ||
      liveRoute?.activityTitle ||
      overview?.currentActivity?.locationName ||
      '下一站';

    const safeParking = parkingHit
      ? {
          detailZh: parkingHit.placeNameZh,
          trailingZh: formatParkingTrailingZh(parkingHit, restSuggested),
          relatedPoiId: parkingHit.placeId,
          restSuggested,
        }
      : undefined;

    const fuel = fuelHit
      ? {
          detailZh: fuelHit.placeNameZh,
          trailingZh: formatFuelTrailingZh(fuelHit),
          relatedPoiId: fuelHit.placeId,
        }
      : fuelKm != null
        ? {
            detailZh: `下一可靠油站约 ${Math.round(fuelKm)} km`,
            trailingZh: `${Math.round(fuelKm)} km`,
          }
        : {
            detailZh: '下一可靠油站评估中',
            trailingZh: '稍后刷新',
          };

    return projectInTripHome({
      destinationNameZh: destZh,
      destinationLocalName: overview?.currentActivity?.locationName,
      etaRangeLabelZh: this.formatEtaRange(
        overview?.currentActivity?.estimatedArrival || liveRoute?.eta,
      ),
      progress: overview?.currentActivity?.progress ?? liveRoute?.progress,
      distanceProgressLabelZh: liveRoute?.distanceToDestination
        ? liveRoute.distanceToDestination
        : undefined,
      remainingDurationLabelZh:
        overview?.currentActivity?.remainingTime || liveRoute?.remaining,
      toItemId: undefined,
      road: {
        alertTitle: road?.alertTitle,
        alertDetail: road?.alertDetail,
        severity:
          road?.alertTitle === '路况正常'
            ? 'ok'
            : /封|关闭|closed/i.test(`${road?.alertTitle ?? ''} ${road?.alertDetail ?? ''}`)
              ? 'high'
              : 'medium',
        plowDelayRangeMin: road?.plowDelayRangeMin,
      },
      remainingDrive: {
        detailZh: (() => {
          const time =
            overview?.currentActivity?.remainingTime || liveRoute?.remaining;
          const dist = liveRoute?.distanceToDestination;
          if (time && dist) return `${time}（${dist}）`;
          return time || dist || undefined;
        })(),
        trailingZh: overview?.currentActivity?.estimatedArrival
          ? `预计 ${overview.currentActivity.estimatedArrival} 到达`
          : liveRoute?.eta
            ? `预计 ${liveRoute.eta} 到达`
            : undefined,
      },
      safeParking,
      fuel,
      hardWindow,
      alerts,
      activeRunbook: opts.includeActiveRunbook ? activeRunbook : null,
      inlineReminder: opts.includeReminder ? inlineReminder : null,
      appliedProposal: inTrip.appliedProposal ?? null,
      dismissedReminderIds: dismissed,
      includeReminder: opts.includeReminder,
      includeActiveRunbook: opts.includeActiveRunbook,
      evidenceUpdatedAt: new Date().toISOString(),
      contextVersion,
    });
  }

  private async ensureRunbookPersisted(
    tripId: string,
    mobile: MobileMetaWithInTrip,
    trigger: RunbookTrigger,
    runbookId: string,
    alert: NonNullable<ReturnType<typeof pickRunbookSourceAlert>>,
    severity: 'HIGH' | 'CRITICAL',
    itinerary: Awaited<ReturnType<MobileExecutionService['getTodayItinerary']>> | null,
  ) {
    const inTrip = this.ensureInTripMeta(mobile);
    const existing = inTrip.runbooksById?.[runbookId];
    if (existing?.status === 'CLOSED' || existing?.status === 'DEFERRED' || existing?.status === 'ACKNOWLEDGED') {
      return;
    }
    if (existing?.status === 'ACTIVE' && existing.relatedRiskId === (alert.riskId ?? alert.id)) {
      return;
    }

    const packId = this.packIdForTrigger(trigger);
    let packOps: IcelandDriveRunbookCandidateOp[] = ['REROUTE', 'SHORTEN', 'END_DAY_EARLY'];
    let immediateZh = '先安全停车，确认路况与燃油后再决定是否改道';
    try {
      const pack = loadIcelandDriveRunbook(packId);
      packOps = [...pack.candidateOperations].slice(0, 3) as IcelandDriveRunbookCandidateOp[];
      immediateZh =
        pack.immediateSafetyActions[0]?.description ?? immediateZh;
    } catch {
      // pack optional for BFF projection
    }

    const confirmCodes = this.confirmCodesForTrigger(trigger);
    const requiresUserConfirm = requiresUserConfirmFromReasons(confirmCodes);

    const options: RunbookOptionDto[] = packOps.map((op, idx) => {
      const letter = OPTION_LETTERS[idx] ?? String(idx + 1);
      const optionId = `opt_${letter.toLowerCase()}_${op.toLowerCase()}`;
      const labels = OP_LABELS_ZH[op];
      const proposalId = buildProposalId(runbookId, optionId);
      return {
        optionId,
        letter,
        titleZh: labels.title,
        subtitleZh: labels.subtitle,
        impactLabelZh: idx === 0 ? '+40–60 min' : idx === 1 ? '+20–30 min' : undefined,
        isRecommended: idx === 0,
        verifiedProposalId: proposalId,
      };
    });

    const recommended = options[0]!;
    const impacted =
      alert.affectedActivities?.length > 0
        ? alert.affectedActivities
        : (itinerary?.items ?? [])
            .filter((i) => i.status === 'upcoming' || i.status === 'inProgress')
            .slice(0, 3)
            .map((i) => i.title);

    const stored: StoredRunbookState = {
      runbookId,
      trigger,
      pageTitleZh: `${RUNBOOK_TRIGGER_TITLES_ZH[trigger]}处理建议`,
      alertSummaryZh: alert.userNarrative?.whatHappened ?? alert.reason ?? alert.title,
      whatHappenedZh: alert.userNarrative?.whatHappened ?? alert.reason ?? alert.title,
      doFirstZh: immediateZh,
      impactedItemsZh: impacted.length ? impacted : ['后续行程可能受影响'],
      options,
      recommendationZh: `推荐方案 ${recommended.letter}：${recommended.titleZh}`,
      requiresParkConfirmZh: requiresUserConfirm
        ? '建议安全停车后再确认改道方案'
        : '可在行驶中确认轻量调整，复杂改道请停车后操作',
      requiresUserConfirm,
      recommendedOptionId: recommended.optionId,
      relatedRiskId: alert.riskId ?? alert.id,
      relatedAlertId: alert.id,
      severity,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    inTrip.runbooksById = { ...(inTrip.runbooksById ?? {}), [runbookId]: stored };
    inTrip.proposalsById = { ...(inTrip.proposalsById ?? {}) };

    for (const opt of options) {
      if (!opt.verifiedProposalId) continue;
      const codes = opt.isRecommended ? confirmCodes : this.confirmCodesForOption(opt.optionId, trigger);
      const proposal: StoredVerifiedProposal = {
        proposalId: opt.verifiedProposalId,
        runbookId,
        optionId: opt.optionId,
        optionLetter: opt.letter,
        titleZh: `方案 ${opt.letter}：${opt.titleZh}`,
        impact: {
          delayLabelZh: opt.impactLabelZh
            ? `预计延误 ${opt.impactLabelZh.replace(/^\+/, '')}`
            : '预计延误待评估',
          detourDistanceLabelZh: /reroute/i.test(opt.optionId)
            ? '绕路里程待评估'
            : '绕路里程无明显增加',
          bulletsZh: [
            opt.subtitleZh,
            ...(impacted.slice(0, 2).map((t) => `可能影响：${t}`)),
          ],
        },
        routePreview: {
          noteZh: 'P0 仅文案预览；几何路线见 P1',
        },
        confirmReasonsZh: confirmReasonsZhFor(codes),
        confirmReasonCodes: codes,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
      };
      inTrip.proposalsById[opt.verifiedProposalId] = proposal;
    }

    // Keep requiresUserConfirm aligned with recommended proposal codes
    stored.requiresUserConfirm = requiresUserConfirmFromReasons(confirmCodes);
    inTrip.runbooksById[runbookId] = stored;

    mobile.inTripHome = inTrip;
    await this.saveMobileMeta(tripId, mobile);
  }

  private packIdForTrigger(
    trigger: RunbookTrigger,
  ): 'IS_RB_ROAD_CLOSURE' | 'IS_RB_STRONG_WIND' | 'IS_RB_FUEL_INSUFFICIENT' | 'IS_RB_BOOKING_ETA_MISS' {
    switch (trigger) {
      case 'ROAD_CLOSURE':
        return 'IS_RB_ROAD_CLOSURE';
      case 'STRONG_WIND':
        return 'IS_RB_STRONG_WIND';
      case 'FUEL_INSUFFICIENT':
        return 'IS_RB_FUEL_INSUFFICIENT';
      case 'BOOKING_ETA_MISS':
        return 'IS_RB_BOOKING_ETA_MISS';
    }
  }

  private confirmCodesForTrigger(trigger: RunbookTrigger): ConfirmReasonCode[] {
    switch (trigger) {
      case 'ROAD_CLOSURE':
        return ['CHANGE_MAIN_ROUTE', 'LARGE_DETOUR', 'SIGNIFICANT_DRIVE_INCREASE'];
      case 'STRONG_WIND':
        return ['ACCEPT_HIGH_RISK', 'CHANGE_MAIN_ROUTE'];
      case 'FUEL_INSUFFICIENT':
        return ['CHANGE_MAIN_ROUTE', 'SIGNIFICANT_DRIVE_INCREASE'];
      case 'BOOKING_ETA_MISS':
        return ['DELETE_ACTIVITY', 'AFFECTS_BOOKED_ITEM'];
    }
  }

  private confirmCodesForOption(optionId: string, trigger: RunbookTrigger): ConfirmReasonCode[] {
    if (/remove/i.test(optionId)) return ['DELETE_ACTIVITY', 'AFFECTS_BOOKED_ITEM'];
    if (/end_day/i.test(optionId)) return ['CHANGE_LODGING', 'AFFECTS_BOOKED_ITEM'];
    if (/reroute/i.test(optionId)) return this.confirmCodesForTrigger(trigger);
    if (/shorten|shift/i.test(optionId)) return [];
    return this.confirmCodesForTrigger(trigger);
  }

  private resolveOriginLatLng(
    liveRoute: Awaited<ReturnType<MobileExecutionService['getLiveRoute']>> | null,
    itinerary: Awaited<ReturnType<MobileExecutionService['getTodayItinerary']>> | null,
  ): { lat: number; lng: number } | undefined {
    const markers = liveRoute?.map?.markers ?? [];
    for (const m of markers) {
      if (
        typeof m.lat === 'number' &&
        typeof m.lng === 'number' &&
        Number.isFinite(m.lat) &&
        Number.isFinite(m.lng)
      ) {
        return { lat: m.lat, lng: m.lng };
      }
    }
    const poly =
      liveRoute?.map?.polylines?.find((p) => p.style === 'primary') ??
      liveRoute?.map?.polylines?.[0];
    const first = poly?.coordinates?.[0];
    if (first && Number.isFinite(first[0]) && Number.isFinite(first[1])) {
      return { lat: first[0], lng: first[1] };
    }
    void itinerary;
    return undefined;
  }

  private resolveHardWindow(
    itinerary: Awaited<ReturnType<MobileExecutionService['getTodayItinerary']>> | null,
    overview: Awaited<ReturnType<MobileExecutionService['getExecutionOverview']>> | null,
  ) {
    if (itinerary?.items?.length) {
      const upcoming = itinerary.items.find(
        (i) =>
          i.status === 'upcoming' || i.status === 'inProgress' || i.status === 'delayed',
      );
      if (upcoming) {
        return {
          detailZh: upcoming.endTime
            ? `${upcoming.title} · ${upcoming.endTime} 截止`
            : upcoming.title,
          trailingZh: upcoming.status === 'delayed' ? '可能错过' : '仍可赶上',
          relatedItemId: upcoming.id,
          attention: upcoming.status === 'delayed' || upcoming.status === 'risk',
        };
      }
    }
    const activity = overview?.currentActivity;
    if (activity?.title) {
      return {
        detailZh: activity.estimatedArrival
          ? `${activity.title} · 预计 ${activity.estimatedArrival}`
          : activity.title,
        trailingZh: '仍可赶上',
        attention: false,
      };
    }
    return {
      detailZh: '今日暂无硬时间窗',
      trailingZh: '无截止',
      attention: false,
    };
  }

  private estimateNextFuelKm(metadata: unknown): number | undefined {
    const meta = (metadata as Record<string, unknown>) ?? {};
    for (const key of ['nextFuelStationKm', 'nextReliableFuelKm', 'fuelNextStationKm']) {
      const v = meta[key];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    const nested = meta.executionFacts as Record<string, unknown> | undefined;
    if (nested) {
      for (const key of ['nextFuelStationKm', 'nextReliableFuelKm']) {
        const v = nested[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
    }
    return undefined;
  }

  private resolveTimezone(metadata: unknown): string {
    const meta =
      metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
    const tz = meta.timezone ?? meta.timeZone ?? meta.displayTimezone;
    return typeof tz === 'string' && tz.trim() ? tz.trim() : DEFAULT_TRIP_DISPLAY_TIMEZONE;
  }

  private inferRestSuggested(remaining?: string): boolean {
    if (!remaining) return false;
    const hours = remaining.match(/(\d+)\s*小时/);
    const mins = remaining.match(/(\d+)\s*分钟/);
    const h = hours ? Number(hours[1]) : 0;
    const m = mins ? Number(mins[1]) : 0;
    return h * 60 + m >= 120;
  }

  private inferSunsetFromAlerts(
    alerts: Awaited<ReturnType<MobileExecutionService['getExecutionAlerts']>> | null,
  ): boolean {
    if (!alerts?.primaryRisk) return false;
    const blob = `${alerts.primaryRisk.riskType ?? ''} ${alerts.primaryRisk.title} ${alerts.primaryRisk.reason}`.toLowerCase();
    return /sunset|日落|缓冲/.test(blob) && !pickRunbookSourceAlert(alerts);
  }

  private formatEtaRange(eta?: string): string {
    if (!eta?.trim()) return '预计到达时间待评估';
    // If already a range, keep; else present as single-point label
    if (/–|-|—/.test(eta)) return eta;
    return eta;
  }

  private isProposalExpired(p: StoredVerifiedProposal): boolean {
    if (!p.expiresAt) return false;
    return Date.parse(p.expiresAt) < Date.now();
  }

  private toRunbookDto(stored: StoredRunbookState, contextVersion: number): ExecutionRunbookDto {
    return {
      schemaId: EXECUTION_RUNBOOK_SCHEMA_ID,
      runbookId: stored.runbookId,
      trigger: stored.trigger,
      pageTitleZh: stored.pageTitleZh,
      alertSummaryZh: stored.alertSummaryZh,
      whatHappenedZh: stored.whatHappenedZh,
      doFirstZh: stored.doFirstZh,
      impactedItemsZh: stored.impactedItemsZh,
      options: stored.options,
      recommendationZh: stored.recommendationZh,
      requiresParkConfirmZh: stored.requiresParkConfirmZh,
      requiresUserConfirm: stored.requiresUserConfirm,
      recommendedOptionId: stored.recommendedOptionId,
      relatedRiskId: stored.relatedRiskId,
      relatedAlertId: stored.relatedAlertId,
      contextVersion,
    };
  }

  private toProposalDto(
    stored: StoredVerifiedProposal,
    contextVersion: number,
  ): VerifiedProposalDto {
    return {
      schemaId: VERIFIED_PROPOSAL_SCHEMA_ID,
      proposalId: stored.proposalId,
      runbookId: stored.runbookId,
      optionId: stored.optionId,
      optionLetter: stored.optionLetter,
      titleZh: stored.titleZh,
      impact: stored.impact,
      routePreview: stored.routePreview,
      confirmReasonsZh: stored.confirmReasonsZh,
      confirmReasonCodes: stored.confirmReasonCodes,
      expiresAt: stored.expiresAt,
      contextVersion,
    };
  }

  private ensureInTripMeta(mobile: MobileMetaWithInTrip): InTripHomeMetadata {
    if (!mobile.inTripHome) mobile.inTripHome = {};
    return mobile.inTripHome;
  }

  private async resolveContextVersion(tripId: string, tripUpdatedAt?: Date): Promise<number> {
    const trip =
      tripUpdatedAt != null
        ? { updatedAt: tripUpdatedAt }
        : await this.prisma.trip.findUnique({ where: { id: tripId }, select: { updatedAt: true } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    return computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });
  }

  private async loadMobileMeta(tripId: string): Promise<MobileMetaWithInTrip> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    return ((metadata.mobileExecution as MobileMetaWithInTrip) ?? {}) as MobileMetaWithInTrip;
  }

  private async saveMobileMeta(tripId: string, mobile: MobileMetaWithInTrip) {
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
}
