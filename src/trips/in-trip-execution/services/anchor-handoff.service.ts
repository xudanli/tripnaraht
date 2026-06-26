import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripBudgetIntentService } from '../../budget-os/services/trip-budget-intent.service';
import { BudgetStructureService } from '../../budget-os/services/budget-structure.service';
import { TravelWalletService } from '../../budget-os/services/travel-wallet.service';
import { DecisionProfilingAccessService } from '../../decision-profiling/services/decision-profiling-access.service';
import { DecisionProfilingService } from '../../decision-profiling/services/decision-profiling.service';
import { FrictionRadarService } from '../../decision-profiling/services/friction-radar.service';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import { eventIdFromIdempotencyKey } from '../../event-store/travel-event-idempotency.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  HandoffMaterializeResult,
  HandoffVerifyResult,
  InTripAnchorSnapshot,
  InTripAnchorSnapshotPublic,
} from '../types/anchor-handoff.types';
import { IN_TRIP_ANCHOR_SCHEMA_VERSION } from '../types/anchor-handoff.types';
import {
  defaultTripTimezone,
  isInTripExecutionEnabled,
  isInTripStrictHandoff,
} from '../utils/in-trip-config.util';
import type {
  FrictionAlert,
  FrictionMatrixEntry,
  SplitMechanismMode,
} from '../../decision-profiling/types/decision-profiling.types';
import { TravelStyleQuizService } from '../../decision-profiling/services/travel-style-quiz.service';

const FLIGHT_TYPES = new Set(['FLIGHT', 'TRANSPORT', 'TRANSIT']);
const NON_REFUNDABLE_STATUSES = new Set(['CONFIRMED', 'BOOKED', 'PAID', 'NON_REFUNDABLE']);

@Injectable()
export class AnchorHandoffService {
  private readonly logger = new Logger(AnchorHandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intentService: TripBudgetIntentService,
    private readonly structureService: BudgetStructureService,
    private readonly walletService: TravelWalletService,
    private readonly profilingAccess: DecisionProfilingAccessService,
    private readonly profilingService: DecisionProfilingService,
    private readonly frictionRadar: FrictionRadarService,
    private readonly travelStyleQuiz: TravelStyleQuizService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async verifyHandoffReadiness(tripId: string, actorUserId?: string): Promise<HandoffVerifyResult> {
    const missing: string[] = [];
    const warnings: string[] = [];

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      return { tripId, ready: false, missing: ['trip_not_found'], warnings: [] };
    }

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    if (!metadata.planConfirmed) {
      missing.push('plan_confirmed');
    }

    const intent = await this.intentService.getIntent(tripId);
    if (!intent) missing.push('budget_intent');

    const structure = await this.structureService.getStructure(tripId);
    if (!structure) missing.push('budget_structure');

    const wallet = await this.walletService.getWallet(tripId);
    if (!wallet.paymentRule) missing.push('wallet_rule');

    const splitRow = await this.prisma.tripSplitMechanismConsensus.findUnique({
      where: { tripId },
    });
    if (!splitRow?.lockedAt) {
      missing.push('split_mechanism_locked');
    }

    const dayCount = await this.prisma.tripDay.count({ where: { tripId } });
    if (dayCount === 0) {
      missing.push('itinerary_days');
    }

    const memberIds = await this.profilingAccess.listMemberIds(tripId);
    if (memberIds.length === 0) {
      missing.push('trip_members');
    }

    if (actorUserId && memberIds.includes(actorUserId)) {
      const onboarding = await this.profilingService.getOnboardingStatus(tripId, actorUserId);
      if (onboarding.teamCompletionRate < 80) {
        warnings.push(
          `decision_profiling_completion_${onboarding.teamCompletionRate}%`,
        );
      }
    } else if (memberIds.length > 0) {
      const completed = await this.prisma.tripDecisionProfilingStatus.count({
        where: { tripId, quizCompleted: true },
      });
      const rate = Math.round((completed / memberIds.length) * 100);
      if (rate < 80) {
        warnings.push(`decision_profiling_completion_${rate}%`);
      }
    }

    return {
      tripId,
      ready: missing.length === 0,
      missing,
      warnings,
    };
  }

  async getSnapshot(tripId: string): Promise<InTripAnchorSnapshot | null> {
    const row = await this.prisma.tripInTripAnchorSnapshot.findUnique({
      where: { tripId },
    });
    if (!row) return null;
    return row.snapshot as unknown as InTripAnchorSnapshot;
  }

  toPublicSnapshot(snapshot: InTripAnchorSnapshot): InTripAnchorSnapshotPublic {
    const itemCount = snapshot.itinerary.days.reduce((n, d) => n + d.items.length, 0);
    return {
      tripId: snapshot.tripId,
      materializedAt: snapshot.materializedAt,
      schemaVersion: snapshot.schemaVersion,
      metadata: snapshot.metadata,
      team: {
        memberCount: snapshot.team.members.length,
        profilingCompletionRate: snapshot.team.profilingCompletionRate,
        compatibilityScore: snapshot.team.compatibilityScore,
        highRiskAlertCount: snapshot.team.highRiskAlerts.length,
      },
      budget: {
        total: snapshot.budget.intent.total,
        currency: snapshot.budget.intent.currency,
        splitMechanismLocked: Boolean(snapshot.budget.splitMechanism.lockedAt),
      },
      itinerary: {
        dayCount: snapshot.itinerary.days.length,
        itemCount,
        nonRefundableCount: snapshot.itinerary.nonRefundableItemIds.length,
      },
    };
  }

  async materialize(
    tripId: string,
    materializedBy?: string,
  ): Promise<HandoffMaterializeResult> {
    const verify = await this.verifyHandoffReadiness(tripId, materializedBy);
    if (!verify.ready) {
      throw new BadRequestException({
        message: '行前→行中移交条件未满足',
        missing: verify.missing,
        warnings: verify.warnings,
      });
    }

    const existing = await this.prisma.tripInTripAnchorSnapshot.findUnique({
      where: { tripId },
    });
    if (existing) {
      const snapshot = existing.snapshot as unknown as InTripAnchorSnapshot;
      return {
        tripId,
        materialized: true,
        alreadyExists: true,
        snapshot: this.toPublicSnapshot(snapshot),
        verify,
      };
    }

    const snapshot = await this.buildSnapshot(tripId, materializedBy);
    await this.prisma.tripInTripAnchorSnapshot.create({
      data: {
        tripId,
        schemaVersion: IN_TRIP_ANCHOR_SCHEMA_VERSION,
        snapshot: toInputJsonValue(snapshot),
        materializedAt: new Date(snapshot.materializedAt),
        materializedBy,
      },
    });

    await this.persistAnchorEvent(tripId, snapshot.materializedAt, materializedBy);

    return {
      tripId,
      materialized: true,
      alreadyExists: false,
      snapshot: this.toPublicSnapshot(snapshot),
      verify,
    };
  }

  /** PLANNING → TRAVELING 时调用；fail-open */
  async materializeOnTransition(tripId: string, userId?: string): Promise<void> {
    if (!isInTripExecutionEnabled()) {
      return;
    }

    const verify = await this.verifyHandoffReadiness(tripId, userId);
    if (!verify.ready) {
      if (isInTripStrictHandoff()) {
        this.logger.warn(
          `[InTripHandoff] strict mode: trip ${tripId} entered TRAVELING without ready handoff: ${verify.missing.join(',')}`,
        );
      } else {
        this.logger.warn(
          `[InTripHandoff] trip ${tripId} handoff skipped — missing: ${verify.missing.join(',')}`,
        );
      }
      return;
    }

    try {
      await this.materialize(tripId, userId);
      this.logger.log(`[InTripHandoff] anchor materialized for trip ${tripId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[InTripHandoff] materialize failed trip ${tripId}: ${msg}`);
    }
  }

  private async buildSnapshot(
    tripId: string,
    materializedBy?: string,
  ): Promise<InTripAnchorSnapshot> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { order: 'asc' },
              include: { Place: { select: { nameCN: true, nameEN: true } } },
            },
          },
        },
        TripCollaborator: true,
      },
    });

    const intent = (await this.intentService.getIntent(tripId))!;
    const structure = (await this.structureService.getStructure(tripId))!;
    const wallet = await this.walletService.getWallet(tripId);
    const splitRow = await this.prisma.tripSplitMechanismConsensus.findUniqueOrThrow({
      where: { tripId },
    });

    const memberIds = await this.profilingAccess.listMemberIds(tripId);
    const names = await this.profilingAccess.resolveDisplayNames(memberIds);
    const primaryUserId = memberIds[0] ?? materializedBy ?? 'system';
    const radar = await this.frictionRadar.getRadar(tripId, primaryUserId);

    const travelStyles = [];
    for (const mid of memberIds) {
      const style = await this.travelStyleQuiz.getMyCard(mid);
      if (style) {
        travelStyles.push({
          userId: mid,
          styleLabel: style.styleLabel,
          teamRole: style.teamRole,
        });
      }
    }

    const days: InTripAnchorSnapshot['itinerary']['days'] = [];
    const bigTransportRefs: string[] = [];
    const nonRefundableItemIds: string[] = [];

    for (const day of trip.TripDay) {
      const items = day.ItineraryItem.map((item) => {
        const type = String(item.type);
        const title =
          item.Place?.nameCN ??
          item.Place?.nameEN ??
          item.note ??
          item.id;
        const refundable = !NON_REFUNDABLE_STATUSES.has(
          String(item.bookingStatus ?? '').toUpperCase(),
        ) && !item.isPaid;

        if (!refundable || item.isPaid) {
          nonRefundableItemIds.push(item.id);
        }
        if (FLIGHT_TYPES.has(type.toUpperCase())) {
          bigTransportRefs.push(item.id);
        }

        return {
          id: item.id,
          type,
          title,
          startTime: item.startTime?.toISOString(),
          refundable,
          estimatedCost: item.estimatedCost ?? undefined,
          category: item.costCategory ?? 'other',
        };
      });

      days.push({
        date: DateTime.fromJSDate(day.date).toISODate() ?? day.date.toISOString(),
        items,
      });
    }

    const lockedPlan = await this.prisma.planningPlan.findFirst({
      where: { tripId, status: 'LOCKED' },
      orderBy: { updatedAt: 'desc' },
    });

    const conflictWatchlist = this.buildConflictWatchlist(
      radar.highRiskAlerts,
      radar.frictionMatrix,
    );

    const totalDays = Math.max(
      1,
      Math.ceil(
        DateTime.fromJSDate(trip.endDate).diff(
          DateTime.fromJSDate(trip.startDate),
          'days',
        ).days,
      ) + 1,
    );

    const materializedAt = new Date().toISOString();

    return {
      tripId,
      materializedAt,
      schemaVersion: IN_TRIP_ANCHOR_SCHEMA_VERSION,
      budget: {
        intent,
        structure,
        walletRule: wallet.paymentRule!,
        splitMechanism: {
          recommendedMode: splitRow.recommendedMode as SplitMechanismMode,
          selectedMode: (splitRow.selectedMode as SplitMechanismMode | null) ?? null,
          lockedMode: (splitRow.lockedMode as SplitMechanismMode | null) ?? null,
          lockedAt: splitRow.lockedAt?.toISOString() ?? null,
        },
      },
      team: {
        members: memberIds.map((id) => ({
          userId: id,
          displayName: names.get(id) ?? id.slice(0, 8),
          role:
            trip.TripCollaborator.find((c) => c.userId === id)?.role ?? 'member',
        })),
        travelStyles,
        frictionMatrix: radar.frictionMatrix,
        compatibilityScore: radar.compatibility.overallScore,
        highRiskAlerts: radar.highRiskAlerts,
        profilingCompletionRate: radar.completionRate,
      },
      itinerary: {
        planId: lockedPlan?.id ?? null,
        lockedAt: materializedAt,
        days,
        bigTransportRefs,
        nonRefundableItemIds,
      },
      conflictWatchlist,
      metadata: {
        destination: trip.destination,
        startDate: trip.startDate.toISOString(),
        endDate: trip.endDate.toISOString(),
        totalDays,
        timezone: defaultTripTimezone(trip.destination),
      },
    };
  }

  private buildConflictWatchlist(
    alerts: FrictionAlert[],
    matrix: FrictionMatrixEntry[],
  ): InTripAnchorSnapshot['conflictWatchlist'] {
    const out: InTripAnchorSnapshot['conflictWatchlist'] = [];

    for (const alert of alerts) {
      out.push({
        domain: alert.domain,
        riskLevel: 'high',
        memberPair: [alert.memberAId, alert.memberBId],
        note: alert.summary,
      });
    }

    for (const entry of matrix) {
      const pair: [string, string] = [entry.memberAId, entry.memberBId];
      if (entry.overallLevel === 'red') {
        const note = entry.cells.find((c) => c.level === 'red')?.reason
          ?? `${entry.memberAName} × ${entry.memberBName}`;
        if (!out.some((w) => w.note === note)) {
          out.push({
            domain: entry.cells[0]?.domain ?? 'group_decision',
            riskLevel: 'high',
            memberPair: pair,
            note,
          });
        }
      } else if (entry.overallLevel === 'yellow') {
        out.push({
          domain: entry.cells[0]?.domain ?? 'group_decision',
          riskLevel: 'medium',
          memberPair: pair,
          note: entry.cells.find((c) => c.level === 'yellow')?.reason
            ?? `${entry.memberAName} × ${entry.memberBName}`,
        });
      }
    }

    return out;
  }

  private async persistAnchorEvent(
    tripId: string,
    materializedAt: string,
    userId?: string,
  ): Promise<void> {
    if (!this.travelEventPersistence) return;

    const idempotencyKey = [
      tripId,
      TravelEventType.TRIP_IN_TRIP_ANCHOR_MATERIALIZED,
      materializedAt,
      userId ?? '',
    ].join('|');

    const envelope = buildTravelEventEnvelope({
      tripId,
      segment: TrajectorySegment.STATE,
      eventType: TravelEventType.TRIP_IN_TRIP_ANCHOR_MATERIALIZED,
      source: TravelEventSource.IN_TRIP_EXECUTION,
      payload: { schemaVersion: IN_TRIP_ANCHOR_SCHEMA_VERSION },
      userId,
      timestamp: materializedAt,
      idempotencyKey,
    });

    void eventIdFromIdempotencyKey(idempotencyKey);
    await this.travelEventPersistence.persist(envelope);
  }
}
