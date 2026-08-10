/**
 * Shadow Unified Constraint Assessment for Initial Plan verification snapshots.
 * Evaluates FACTS on the snapshot — does not trust day-assign scores.
 * Authority for SHADOW verificationMode until PlanVersion Apply exists.
 * Never writes PlanVersion.
 */

import { Injectable } from '@nestjs/common';
import type {
  AuthoritativeAggregateOutcome,
  ConstraintAssessmentEvidence,
  InitialPlanAuthoritativeVerification,
  InitialPlanDriftVector,
  InitialPlanVerificationSnapshot,
} from '../types/iceland-initial-plan-verification.types';
import { resolvePlaceAccessFacts } from '../utils/iceland-place-access-facts.util';
import {
  expectedConfirmedLodgingByDayIndex,
  isGoldenSetLodgingPlaceId,
  isLodgingRemoteFromDay,
  resolveLodgingAnchor,
  type ConfirmedLodgingRef,
} from '../utils/iceland-lodging-anchor-assessment.util';
import {
  buildAudit,
  buildConsistencyFingerprint,
} from '../utils/initial-plan-session-consistency.util';

@Injectable()
export class IcelandShadowUnifiedAssessmentService {
  assess(input: {
    snapshot: InitialPlanVerificationSnapshot;
    drift_vector: InitialPlanDriftVector;
    priorFingerprint?: ReturnType<typeof buildConsistencyFingerprint>;
  }): InitialPlanAuthoritativeVerification {
    const assessments: ConstraintAssessmentEvidence[] = [];
    const { snapshot } = input;
    const vehicle = snapshot.tripContext.vehicleProfile ?? {};

    for (const day of snapshot.days) {
      const driveLimit = snapshot.tripContext.dailyDrivingLimitMin ?? 360;
      const driveSlack = driveLimit - day.totalDrivingMin;
      assessments.push({
        cid: 'ICELAND_DAY_DRIVE_CAP_001',
        status: driveSlack < 0 ? 'BLOCK' : 'PASS',
        observedValue: day.totalDrivingMin,
        limitValue: driveLimit,
        slack: driveSlack,
        unit: 'minutes',
        affectedDayIndex: day.dayIndex,
        affectedItemIds: day.items.map((i) => i.itemId),
        basis: 'daily_driving_limit',
        evidenceRefs: [`day:${day.dayIndex}:drive`],
      });

      const byPack = new Map<string, Set<string>>();
      for (const item of day.items) {
        const facts = resolvePlaceAccessFacts(item.canonicalPlaceId, {
          packId: item.packId,
          subregionId: item.subregionId,
        });
        const pack = item.packId ?? facts.packId;
        const sub = item.subregionId ?? facts.subregionId;
        if (!pack || !sub) continue;
        if (!snapshot.dayScopePackIds.includes(pack)) continue;
        if (!byPack.has(pack)) byPack.set(pack, new Set());
        byPack.get(pack)!.add(sub);
      }
      for (const [pack, subs] of byPack) {
        const violated = subs.size > 1;
        assessments.push({
          cid: `ICELAND_DAY_SCOPE_${pack.toUpperCase()}_001`,
          status: violated ? 'BLOCK' : 'PASS',
          observedValue: subs.size,
          limitValue: 1,
          slack: 1 - subs.size,
          unit: 'subregion_count',
          affectedDayIndex: day.dayIndex,
          affectedItemIds: day.items.map((i) => i.itemId),
          basis: 'one_high_span_subregion_per_natural_day',
          evidenceRefs: [`day:${day.dayIndex}:scope:${pack}`, ...subs],
        });
      }

      const packs = new Set(
        day.items
          .map((i) => i.packId ?? resolvePlaceAccessFacts(i.canonicalPlaceId).packId)
          .filter(Boolean) as string[],
      );
      if (packs.has('highlands') && [...packs].some((p) => p !== 'highlands')) {
        assessments.push({
          cid: 'ICELAND_HIGHLANDS_MIX_001',
          status: 'BLOCK',
          observedValue: packs.size,
          limitValue: 1,
          slack: 1 - packs.size,
          unit: 'pack_diversity',
          affectedDayIndex: day.dayIndex,
          affectedItemIds: day.items.map((i) => i.itemId),
          basis: 'highlands_requires_explicit_branch',
          evidenceRefs: [...packs],
        });
      }

      for (const item of day.items) {
        const road = {
          ...resolvePlaceAccessFacts(item.canonicalPlaceId),
          ...item.roadRequirements,
        };

        if (road.requires4wd) {
          const eligible = vehicle.is4wd === true ? 1 : 0;
          assessments.push({
            cid: 'ICELAND_VEHICLE_4WD_001',
            status: eligible ? 'PASS' : 'BLOCK',
            observedValue: eligible,
            limitValue: 1,
            slack: eligible - 1,
            unit: 'vehicle_eligibility',
            affectedDayIndex: day.dayIndex,
            affectedItemIds: [item.itemId],
            basis: '4wd_required',
            evidenceRefs: [`place:${item.canonicalPlaceId}`, 'vehicle.is4wd'],
          });
        }

        if (road.requiresFroad) {
          const eligible = vehicle.allowsFRoad === true ? 1 : 0;
          assessments.push({
            cid: 'ICELAND_VEHICLE_FROAD_001',
            status: eligible ? 'PASS' : 'BLOCK',
            observedValue: eligible,
            limitValue: 1,
            slack: eligible - 1,
            unit: 'vehicle_eligibility',
            affectedDayIndex: day.dayIndex,
            affectedItemIds: [item.itemId],
            basis: 'f_road_required',
            evidenceRefs: [`place:${item.canonicalPlaceId}`, 'vehicle.allowsFRoad'],
          });
        }

        if (road.riverCrossingRisk) {
          const eligible = vehicle.allowsRiverCrossing === true ? 1 : 0;
          assessments.push({
            cid: 'ICELAND_VEHICLE_RIVER_001',
            status: eligible ? 'PASS' : 'EXECUTION_BLOCK',
            observedValue: eligible,
            limitValue: 1,
            slack: eligible - 1,
            unit: 'vehicle_eligibility',
            affectedDayIndex: day.dayIndex,
            affectedItemIds: [item.itemId],
            basis: 'river_crossing_self_drive',
            evidenceRefs: [
              `place:${item.canonicalPlaceId}`,
              'vehicle.allowsRiverCrossing',
            ],
          });
        }

        if (item.experienceProductId) {
          if (item.bookingState === 'CONFIRMED') {
            const hasBookingProof = item.sourceEvidenceRefs.some((r) =>
              r.startsWith('booking:'),
            );
            assessments.push({
              cid: 'ICELAND_EXPERIENCE_BOOKING_001',
              status: hasBookingProof ? 'PASS' : 'NEED_CONFIRM',
              observedValue: hasBookingProof ? 1 : 0,
              limitValue: 1,
              slack: hasBookingProof ? 0 : -1,
              unit: 'booking_evidence',
              affectedDayIndex: day.dayIndex,
              affectedItemIds: [item.itemId],
              basis: 'confirmed_requires_booking_evidence',
              evidenceRefs: item.sourceEvidenceRefs,
            });
          } else if (item.bookingState === 'NEEDS_BOOKING_VERIFICATION') {
            assessments.push({
              cid: 'ICELAND_EXPERIENCE_BOOKING_001',
              status: 'NEED_CONFIRM',
              observedValue: 0,
              limitValue: 1,
              slack: -1,
              unit: 'booking_evidence',
              affectedDayIndex: day.dayIndex,
              affectedItemIds: [item.itemId],
              basis: 'needs_booking_verification',
              evidenceRefs: item.sourceEvidenceRefs,
            });
          }
        }
      }
    }

    assessments.push(...this.assessLodgingAnchors(snapshot));

    const itemCount = snapshot.days.reduce((s, d) => s + d.items.length, 0);
    if (itemCount === 0) {
      assessments.push({
        cid: 'ICELAND_EMPTY_PLAN_001',
        status: 'BLOCK',
        observedValue: 0,
        limitValue: 1,
        slack: -1,
        unit: 'activity_count',
        basis: 'no_scheduled_activities',
        evidenceRefs: ['proposal:empty'],
      });
    }

    const outcome = this.aggregate(assessments);
    const status = this.mapStatus(outcome);
    const audit = buildAudit({
      outcome,
      assessments,
      drift_vector: input.drift_vector,
      priorFingerprint: input.priorFingerprint,
    });

    return {
      verificationId: snapshot.verificationId,
      proposalId: snapshot.proposalId,
      status,
      aggregateOutcome: outcome,
      assessments,
      audit,
      authoritative: true,
      allowConfirm:
        outcome === 'PASS' || outcome === 'WARN' || outcome === 'NEED_CONFIRM',
      allowPreview:
        outcome === 'PASS' ||
        outcome === 'WARN' ||
        outcome === 'NEED_CONFIRM' ||
        outcome === 'REPAIR',
      writesPlanVersion: false,
    };
  }

  private resolveConfirmedLodgings(
    snapshot: InitialPlanVerificationSnapshot,
  ): ConfirmedLodgingRef[] {
    const fromCtx = snapshot.tripContext.confirmedLodgings ?? [];
    if (fromCtx.length) {
      return fromCtx
        .filter((l) => typeof l.placeId === 'number' && l.placeId > 0)
        .map((l) => ({
          placeId: l.placeId!,
          label: l.label,
          nightDate: l.nightDate,
        }));
    }
    return (snapshot.tripContext.confirmedLodgingPlaceIds ?? []).map(
      (placeId) => ({ placeId }),
    );
  }

  /**
   * Lodging gate grading:
   * - invalid Golden Set lodging place → BLOCK
   * - confirmed night missing / wrong hard anchor → BLOCK / REPAIR
   * - partial nights with soft fill → WARN (confirmable)
   * - remote lodging vs day packs → WARN
   * - full coverage match → PASS
   */
  private assessLodgingAnchors(
    snapshot: InitialPlanVerificationSnapshot,
  ): ConstraintAssessmentEvidence[] {
    const confirmed = this.resolveConfirmedLodgings(snapshot);
    if (!confirmed.length) return [];

    const out: ConstraintAssessmentEvidence[] = [];
    const expectedByIdx = expectedConfirmedLodgingByDayIndex(
      snapshot.days,
      confirmed,
    );

    for (const lodging of confirmed) {
      if (isGoldenSetLodgingPlaceId(lodging.placeId)) continue;
      out.push({
        cid: 'ICELAND_LODGING_ANCHOR_001',
        status: 'BLOCK',
        observedValue: 0,
        limitValue: 1,
        slack: -1,
        unit: 'lodging_match',
        affectedDayIndex: expectedByIdx.size
          ? snapshot.days[0]?.dayIndex
          : undefined,
        basis: 'invalid_lodging_place',
        evidenceRefs: [
          `place:${lodging.placeId}`,
          ...(lodging.nightDate ? [`night:${lodging.nightDate}`] : []),
          `confirmed:${lodging.placeId}`,
        ],
      });
    }

    for (let i = 0; i < snapshot.days.length; i++) {
      const day = snapshot.days[i]!;
      const expected = expectedByIdx.get(i);
      const anchor = resolveLodgingAnchor({
        date: day.date,
        dayIndex: day.dayIndex,
        lodgingAnchor: day.lodgingAnchor,
        endAnchor: day.endAnchor,
        itemCount: day.items.length,
      });
      const dayPackIds = [
        ...new Set(
          day.items
            .map((it) => it.packId ?? resolvePlaceAccessFacts(it.canonicalPlaceId).packId)
            .filter((p): p is string => Boolean(p)),
        ),
      ];

      if (expected) {
        if (!isGoldenSetLodgingPlaceId(expected.placeId)) {
          // Already emitted invalid_lodging_place for this booking.
          continue;
        }
        const evidenceBase = [
          `night:${expected.nightDate}`,
          `expected:${expected.placeId}`,
          `confirmed:${expected.placeId}`,
        ];
        if (!anchor?.placeId) {
          out.push({
            cid: 'ICELAND_LODGING_ANCHOR_001',
            status: 'BLOCK',
            observedValue: 0,
            limitValue: 1,
            slack: -1,
            unit: 'lodging_match',
            affectedDayIndex: day.dayIndex,
            affectedItemIds: day.items.map((it) => it.itemId),
            basis: 'missing_lodging_anchor_with_confirmed_stay',
            evidenceRefs: evidenceBase,
          });
          continue;
        }
        if (anchor.placeId === expected.placeId) {
          out.push({
            cid: 'ICELAND_LODGING_ANCHOR_001',
            status: 'PASS',
            observedValue: 1,
            limitValue: 1,
            slack: 0,
            unit: 'lodging_match',
            affectedDayIndex: day.dayIndex,
            affectedItemIds: day.items.map((it) => it.itemId),
            basis: 'end_anchor_vs_confirmed_lodging',
            evidenceRefs: [`lodging:${anchor.placeId}`, ...evidenceBase],
          });
          if (isLodgingRemoteFromDay(anchor.placeId, dayPackIds)) {
            out.push({
              cid: 'ICELAND_LODGING_ANCHOR_001',
              status: 'WARN',
              observedValue: 0,
              limitValue: 1,
              slack: 0,
              unit: 'lodging_match',
              affectedDayIndex: day.dayIndex,
              affectedItemIds: day.items.map((it) => it.itemId),
              basis: 'lodging_remote_from_day_scope',
              evidenceRefs: [
                `lodging:${anchor.placeId}`,
                `night:${day.date}`,
                ...dayPackIds.map((p) => `pack:${p}`),
              ],
            });
          }
          continue;
        }
        // Soft fill or wrong hotel on a confirmed night — repair back to booking.
        out.push({
          cid: 'ICELAND_LODGING_ANCHOR_001',
          status: 'REPAIR',
          observedValue: 0,
          limitValue: 1,
          slack: -1,
          unit: 'lodging_match',
          affectedDayIndex: day.dayIndex,
          affectedItemIds: day.items.map((it) => it.itemId),
          basis: 'end_anchor_vs_confirmed_lodging',
          evidenceRefs: [
            `lodging:${anchor.placeId}`,
            ...evidenceBase,
            anchor.source ? `source:${anchor.source}` : 'source:unknown',
          ],
        });
        continue;
      }

      // Confirmed bookings exist but not for this night → soft fill is OK (WARN).
      if (anchor?.placeId != null && anchor.source === 'GOLDEN_SET_SOFT') {
        out.push({
          cid: 'ICELAND_LODGING_ANCHOR_001',
          status: 'WARN',
          observedValue: 0,
          limitValue: 1,
          slack: 0,
          unit: 'lodging_match',
          affectedDayIndex: day.dayIndex,
          affectedItemIds: day.items.map((it) => it.itemId),
          basis: 'partial_night_soft_fill',
          evidenceRefs: [
            `lodging:${anchor.placeId}`,
            `night:${day.date}`,
            ...confirmed.map((c) => `confirmed:${c.placeId}`),
          ],
        });
      } else if (!anchor?.placeId && day.items.length > 0) {
        out.push({
          cid: 'ICELAND_LODGING_ANCHOR_001',
          status: 'WARN',
          observedValue: 0,
          limitValue: 1,
          slack: 0,
          unit: 'lodging_match',
          affectedDayIndex: day.dayIndex,
          affectedItemIds: day.items.map((it) => it.itemId),
          basis: 'uncovered_overnight_with_partial_confirmed',
          evidenceRefs: [
            `night:${day.date}`,
            ...confirmed.map((c) => `confirmed:${c.placeId}`),
          ],
        });
      }
    }

    return out;
  }

  private aggregate(
    assessments: ConstraintAssessmentEvidence[],
  ): AuthoritativeAggregateOutcome {
    if (assessments.some((a) => a.status === 'EXECUTION_BLOCK')) {
      return 'EXECUTION_BLOCK';
    }
    if (assessments.some((a) => a.status === 'BLOCK')) return 'BLOCK';
    if (assessments.some((a) => a.status === 'REPAIR')) return 'REPAIR';
    if (assessments.some((a) => a.status === 'NEED_CONFIRM')) return 'NEED_CONFIRM';
    if (assessments.some((a) => a.status === 'WARN')) return 'WARN';
    return 'PASS';
  }

  private mapStatus(
    outcome: AuthoritativeAggregateOutcome,
  ): InitialPlanAuthoritativeVerification['status'] {
    switch (outcome) {
      case 'PASS':
      case 'WARN':
        return 'VERIFIED';
      case 'NEED_CONFIRM':
        return 'VERIFIED_WITH_CONFIRMATIONS';
      case 'REPAIR':
        return 'REPAIR_REQUIRED';
      case 'BLOCK':
      case 'EXECUTION_BLOCK':
        return 'BLOCKED';
      default:
        return 'BLOCKED';
    }
  }
}
