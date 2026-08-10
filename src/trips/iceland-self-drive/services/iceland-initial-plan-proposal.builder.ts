/**
 * Builds InitialPlanProposal preview read model from solver + verify.
 * Never writes PlanVersion.
 */

import { randomUUID } from 'crypto';
import type { SolverCandidate } from '../../../decision-runtime/solver/contracts/solver-response';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type { InitialPlanSeedResult } from '../types/iceland-initial-plan-seed.types';
import type {
  ExperienceProposal,
  InitialPlanDay,
  InitialPlanItem,
  InitialPlanProposal,
  InitialPlanVerification,
  ProposalConfirmation,
  ProposalIssue,
  RegionCoverageSummary,
  SolverMetaSummary,
} from '../types/iceland-initial-plan-proposal.types';
import type { IcelandInitialPlanSolverProblemBundle } from './iceland-initial-plan-solver.adapter';
import { assignOvernightAnchors } from '../utils/assign-confirmed-lodging-anchors.util';
import { resolveIcelandGatewayPlaceRef } from '../utils/iceland-gateway-location.util';
import { experienceBookingConfirmationMessage } from '../utils/experience-booking-confirmation-copy.util';
import {
  orderPlaceIdsHotelAnchored,
  sumDayDriveWithHotels,
} from '../utils/iceland-planning-place-coords.util';

export class IcelandInitialPlanProposalBuilder {
  build(input: {
    tripId: string;
    seed: InitialPlanSeedResult;
    arrange: InitialPlanArrangeInput;
    bundle: IcelandInitialPlanSolverProblemBundle;
    candidate: SolverCandidate;
    verification: InitialPlanVerification;
    proposalVersion?: number;
  }): InitialPlanProposal {
    const { seed, arrange, bundle, candidate, verification } = input;
    const meta = bundle.semantics.nodeMetaById;

    const days: InitialPlanDay[] = candidate.dayPlans.map((dp) => {
      const dayIndex = Number(dp.dayId.replace('day-', ''));
      const date = bundle.semantics.datesByDayId[dp.dayId] ?? '';
      const items: InitialPlanItem[] = dp.nodeIds.map((nodeId, i) => {
        const m = meta[nodeId]!;
        const startMin = dp.startMin?.[i] ?? 600 + i * 90;
        const endMin = startMin + (m.serviceDurationMin || 60);
        return {
          itemId: `${dp.dayId}:${nodeId}`,
          placeId: m.placeId,
          experienceProductId: m.experienceProductId,
          label: m.label,
          kind: m.experienceProductId
            ? 'EXPERIENCE_OPTIONAL'
            : m.countsTowardAttractionCoverage
              ? m.coverageRole === 'PRIMARY' || m.coverageRole === 'SECONDARY'
                ? ((m.evidence as { source?: string }).source === 'EXPERIENCE'
                    ? 'EXPERIENCE_OPTIONAL'
                    : 'ATTRACTION')
                : 'ATTRACTION'
              : m.placeId
                ? 'ATTRACTION'
                : 'SUPPORT',
          startMin,
          endMin,
          evidence: m.evidence,
          visitClusterId: m.visitClusterId,
          countsTowardAttractionCoverage: m.countsTowardAttractionCoverage,
        };
      });

      // Normalize kind for attraction area
      for (const it of items) {
        const m = meta[`poi:${it.placeId}`];
        if (m && arrange.attractionCandidates.find((a) => a.canonicalPlaceId === it.placeId)) {
          const cand = arrange.attractionCandidates.find(
            (a) => a.canonicalPlaceId === it.placeId,
          );
          if (cand && !cand.countsTowardAttractionCoverage && cand.parentCanonicalPlaceId) {
            it.kind = 'ATTRACTION';
            it.countsTowardAttractionCoverage = false;
            it.visitClusterId = `cluster:${cand.parentCanonicalPlaceId}`;
          }
        }
      }

      const packIds = [
        ...new Set(
          items
            .map((it) => meta[`poi:${it.placeId}`]?.packId)
            .filter(Boolean) as string[],
        ),
      ];
      const subregionId = items
        .map((it) => meta[`poi:${it.placeId}`]?.subregionId)
        .find(Boolean);

      const activityMinutes = items.reduce((s, it) => s + (it.endMin - it.startMin), 0);
      // drivingMinutes finalized after overnight hotel anchors are assigned
      const drivingMinutes = 0;
      const feasibilityStatus =
        verification.summary.findings.some(
          (f) => f.dayIndex === dayIndex && f.severity === 'BLOCK',
        )
          ? 'blocked'
          : verification.summary.findings.some(
                (f) => f.dayIndex === dayIndex && f.severity === 'WARN',
              )
            ? 'warning'
            : 'ok';

      return {
        dayIndex,
        date,
        dayId: dp.dayId,
        subregionId,
        packIds,
        items,
        drivingMinutes,
        activityMinutes,
        bufferMinutes: 45,
        feasibilityStatus,
        warnings: verification.summary.findings
          .filter((f) => f.dayIndex === dayIndex)
          .map((f) => f.message),
      };
    });

    const overnightDays = days.map((d) => ({
      date: d.date,
      packIds: d.packIds,
      regionIds: [
        ...new Set(
          d.items
            .map((it) => meta[`poi:${it.placeId}`]?.regionId)
            .filter((r): r is string => Boolean(r)),
        ),
      ],
      startAnchor: d.startAnchor,
      endAnchor: d.endAnchor,
    }));
    assignOvernightAnchors(overnightDays, {
      confirmedLodgings: arrange.confirmedLodgings,
      softLodgings: arrange.supportNodes
        .filter((n) => n.entityType === 'LODGING')
        .map((n) => ({
          placeId: n.canonicalPlaceId,
          label: n.label,
          regionId: n.regionId,
          packId: n.packId,
        })),
    });
    for (let i = 0; i < days.length; i++) {
      days[i]!.startAnchor = overnightDays[i]!.startAnchor;
      days[i]!.endAnchor = overnightDays[i]!.endAnchor;
    }

    // Reorder POIs and recompute drive using overnight hotels + arrival/departure gateways
    const originGateway = resolveIcelandGatewayPlaceRef(arrange.originGateway);
    const exitGateway = resolveIcelandGatewayPlaceRef(
      arrange.exitGateway,
      arrange.originGateway?.label ?? 'keflavik',
    );
    for (let i = 0; i < days.length; i++) {
      const day = days[i]!;
      const attractionItems = day.items.filter((it) => it.placeId != null);
      const otherItems = day.items.filter((it) => it.placeId == null);
      const placeIds = attractionItems
        .map((it) => it.placeId!)
        .filter((p): p is number => typeof p === 'number');
      const isFirst = i === 0;
      const isLast = i === days.length - 1;
      const startHotel = isFirst
        ? (originGateway.placeId ?? day.startAnchor?.placeId)
        : day.startAnchor?.placeId;
      const endHotel = isLast
        ? (exitGateway.placeId ?? day.endAnchor?.placeId)
        : day.endAnchor?.placeId;
      const orderedPlaces = orderPlaceIdsHotelAnchored(
        placeIds,
        startHotel,
        endHotel,
      );
      const byPlace = new Map(
        attractionItems.map((it) => [it.placeId, it] as const),
      );
      const reordered = orderedPlaces
        .map((p) => byPlace.get(p))
        .filter((it): it is NonNullable<typeof it> => Boolean(it));
      // Rebuild start/end minutes in visit order
      let cursor = 600;
      for (const it of reordered) {
        const dur = Math.max(30, (it.endMin ?? cursor + 60) - (it.startMin ?? cursor));
        it.startMin = cursor;
        it.endMin = cursor + dur;
        cursor = it.endMin + 15;
      }
      day.items = [...reordered, ...otherItems];
      day.drivingMinutes = sumDayDriveWithHotels(
        reordered.map((it) => it.placeId!).filter((p): p is number => typeof p === 'number'),
        startHotel,
        endHotel,
      );
      day.activityMinutes = day.items.reduce(
        (s, it) => s + ((it.endMin ?? 0) - (it.startMin ?? 0)),
        0,
      );
    }

    const coverageSummary: RegionCoverageSummary[] = seed.selectedRegions.map((r) => {
      const placeIds = days
        .flatMap((d) => d.items)
        .filter(
          (it) =>
            it.countsTowardAttractionCoverage &&
            it.placeId != null &&
            arrange.attractionCandidates.some(
              (a) => a.canonicalPlaceId === it.placeId && a.regionId === r.regionId,
            ),
        )
        .map((it) => it.placeId!);
      const corridorOnly =
        r.coverageStatus === 'CORRIDOR_ONLY' || !r.regionalGoldenSetReady;
      return {
        regionId: r.regionId,
        coverageStatus: r.coverageStatus,
        regionalGoldenSetReady: r.regionalGoldenSetReady,
        selectedAttractionPlaceIds: [...new Set(placeIds)],
        countsTowardAttractionCoverage: new Set(placeIds).size,
        corridorOnly,
        message: corridorOnly
          ? '区域内容覆盖不足 / corridor-only — 不参与景点覆盖验收'
          : undefined,
      };
    });

    const requiredConfirmations: ProposalConfirmation[] = [];
    for (const exp of arrange.experienceCandidates) {
      if (exp.status === 'NEEDS_BOOKING_VERIFICATION') {
        requiredConfirmations.push({
          confirmationId: `exp:${exp.experienceProductId}`,
          kind: 'EXPERIENCE_BOOKING',
          message: experienceBookingConfirmationMessage(
            exp.experienceProductId,
            exp.label,
          ),
          experienceProductId: exp.experienceProductId,
          blockingApply: true,
        });
      }
    }
    for (const gap of arrange.catalogGaps) {
      requiredConfirmations.push({
        confirmationId: `gap:${gap.regionId}`,
        kind: 'CATALOG_GAP',
        message: `${gap.regionId}: missing ${gap.missingCapabilities.join(',')}`,
        blockingApply: false,
      });
    }
    for (const f of verification.summary.findings) {
      if (f.code.startsWith('NEED_CONFIRM')) {
        requiredConfirmations.push({
          confirmationId: `confirm:${f.code}:${f.placeId ?? 'x'}`,
          kind: 'NEED_CONFIRM',
          message: f.message,
          placeId: f.placeId,
          blockingApply: false,
        });
      }
    }

    const optionalExperiences: ExperienceProposal[] = arrange.experienceCandidates.map(
      (e) => ({
        experienceProductId: e.experienceProductId,
        label: e.label,
        regionId: e.regionId,
        status: e.status,
        meetingPlaceId: e.meetingPlaceId,
        selectedBecause: e.selectedBecause,
        requiresBookingVerification: true,
      }),
    );

    const unresolvedIssues: ProposalIssue[] = arrange.unresolvedEntities.map((u) => ({
      code: u.code,
      severity: u.severity,
      message: u.message,
      placeId: u.placeId,
    }));

    const evidence = days.flatMap((d) => d.items.map((i) => i.evidence));

    const solverMeta: SolverMetaSummary = {
      engine: 'ICELAND_COVERAGE_DAY_ASSIGN',
      strategy: 'ICELAND_COVERAGE_DAY_ASSIGN@v1',
      version: '2026-07-proposal-v1',
      elapsedMs: 0,
      seed: bundle.problem.solverConfig.seed,
      candidateId: candidate.candidateId,
      relationProjection: {
        parentChild: bundle.semantics.parentChildHard.length,
        coVisitClusters: bundle.semantics.coVisitSoft.length,
        softAlternatives: bundle.semantics.softAlternative.length,
        dayScopePacks: bundle.semantics.dayScopePackIds.length,
      },
    };

    return {
      proposalId: randomUUID(),
      tripId: input.tripId,
      version: input.proposalVersion ?? 1,
      days,
      selectedRegions: seed.selectedRegions,
      coverageSummary,
      requiredConfirmations,
      optionalExperiences,
      unresolvedIssues,
      solverMeta,
      verificationSummary: verification.summary,
      evidence,
      writesPlanVersion: false,
    };
  }
}
