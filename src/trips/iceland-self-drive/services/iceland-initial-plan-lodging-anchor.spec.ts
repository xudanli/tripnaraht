import { createHash } from 'crypto';
import { IcelandInitialPlanSeedService } from './iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './iceland-initial-plan-arrange-projector.service';
import { IcelandInitialPlanPipelineService } from './iceland-initial-plan-pipeline.service';
import { IcelandInitialPlanSolverAdapter } from './iceland-initial-plan-solver.adapter';
import { IcelandInitialPlanDayAssignSolver } from './iceland-initial-plan-day-assign.solver';
import { IcelandInitialPlanProposalBuilder } from './iceland-initial-plan-proposal.builder';

describe('Initial plan proposal — overnight anchors', () => {
  it('sets endAnchor from confirmedLodgings on matching nights', async () => {
    const pipeline = new IcelandInitialPlanPipelineService(
      new IcelandInitialPlanSeedService(),
      new IcelandInitialPlanArrangeProjector(),
    );
    const { seed, arrange } = await pipeline.buildArrangeInput({
      tripId: 'trip_lodging_anchor',
      travelDates: { startDate: '2026-07-22', endDate: '2026-07-24' },
      regionIds: ['golden_circle'],
      confirmedLodgings: [
        { placeId: 381045, label: 'Vík Hostel', nightDate: '2026-07-22' },
        { placeId: 381048, label: 'Fosshotel Glacier Lagoon', nightDate: '2026-07-23' },
      ],
    });

    expect(arrange.confirmedLodgings).toHaveLength(2);

    const bundle = new IcelandInitialPlanSolverAdapter().adapt(arrange, {
      startDate: '2026-07-22',
      endDate: '2026-07-24',
      maxActivitiesPerDay: 3,
      seed: parseInt(
        createHash('sha256').update('trip_lodging_anchor').digest('hex').slice(0, 8),
        16,
      ),
    });
    const solved = new IcelandInitialPlanDayAssignSolver().solve(bundle);
    const proposal = new IcelandInitialPlanProposalBuilder().build({
      tripId: 'trip_lodging_anchor',
      seed,
      arrange,
      bundle,
      candidate: solved.response.candidates[0]!,
      verification: {
        status: 'VERIFIED',
        summary: {
          status: 'VERIFIED',
          pass: true,
          repaired: false,
          repairAttempts: 0,
          blockingCodes: [],
          warnings: [],
          findings: [],
        },
        executionBlocked: false,
        writesPlanVersion: false,
      },
    });

    expect(proposal.days[0]!.endAnchor?.placeId).toBe(381045);
    expect(proposal.days[0]!.endAnchor?.source).toBe('CONFIRMED_BOOKING');
    expect(proposal.days[1]!.startAnchor?.placeId).toBe(381045);
    expect(proposal.days[1]!.endAnchor?.placeId).toBe(381048);

    expect(bundle.semantics.overnightEndPlaceIdByDayId['day-1']).toBe(381045);
    expect(bundle.semantics.overnightStartPlaceIdByDayId['day-2']).toBe(381045);

    // Arrival day starts at KEF; departure day ends at KEF (default gateways)
    expect(bundle.semantics.originGatewayPlaceId).toBe(381221);
    expect(bundle.semantics.exitGatewayPlaceId).toBe(381221);
    expect(bundle.semantics.overnightStartPlaceIdByDayId['day-1']).toBe(381221);
    expect(bundle.semantics.overnightEndPlaceIdByDayId['day-3']).toBe(381221);

    // Hotel legs included in drivingMinutes when day has POIs
    for (const day of proposal.days) {
      if (day.items.some((it) => it.placeId != null) && day.endAnchor?.placeId) {
        expect(day.drivingMinutes).toBeGreaterThan(0);
      }
    }
  });

  it('soft-fills Golden Set LODGING when no confirmed bookings', async () => {
    const pipeline = new IcelandInitialPlanPipelineService(
      new IcelandInitialPlanSeedService(),
      new IcelandInitialPlanArrangeProjector(),
    );
    const { seed, arrange } = await pipeline.buildArrangeInput({
      tripId: 'trip_soft_lodging',
      travelDates: { startDate: '2026-07-22', endDate: '2026-07-24' },
      regionIds: ['south_coast'],
    });

    expect(arrange.supportNodes.some((n) => n.entityType === 'LODGING')).toBe(true);

    const bundle = new IcelandInitialPlanSolverAdapter().adapt(arrange, {
      startDate: '2026-07-22',
      endDate: '2026-07-24',
      maxActivitiesPerDay: 3,
      seed: 42,
    });
    const solved = new IcelandInitialPlanDayAssignSolver().solve(bundle);
    const proposal = new IcelandInitialPlanProposalBuilder().build({
      tripId: 'trip_soft_lodging',
      seed,
      arrange,
      bundle,
      candidate: solved.response.candidates[0]!,
      verification: {
        status: 'VERIFIED',
        summary: {
          status: 'VERIFIED',
          pass: true,
          repaired: false,
          repairAttempts: 0,
          blockingCodes: [],
          warnings: [],
          findings: [],
        },
        executionBlocked: false,
        writesPlanVersion: false,
      },
    });

    const softNights = proposal.days.filter(
      (d) => d.endAnchor?.source === 'GOLDEN_SET_SOFT',
    );
    expect(softNights.length).toBeGreaterThan(0);
    expect(softNights.every((d) => typeof d.endAnchor?.placeId === 'number')).toBe(
      true,
    );
  });
});
