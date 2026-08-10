/**
 * Day-assign: highlands explicit branch must get dedicated days before corridor packs fill capacity.
 */

import { createHash } from 'crypto';
import { IcelandInitialPlanSeedService } from './iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './iceland-initial-plan-arrange-projector.service';
import { IcelandInitialPlanPipelineService } from './iceland-initial-plan-pipeline.service';
import { IcelandInitialPlanSolverAdapter } from './iceland-initial-plan-solver.adapter';
import { IcelandInitialPlanDayAssignSolver } from './iceland-initial-plan-day-assign.solver';
import { IcelandInitialPlanProposalBuilder } from './iceland-initial-plan-proposal.builder';

describe('IcelandInitialPlanDayAssignSolver — highlands branch', () => {
  it('schedules highland coverage when highlands is selected alongside south/golden/snae (July)', async () => {
    const pipeline = new IcelandInitialPlanPipelineService(
      new IcelandInitialPlanSeedService(),
      new IcelandInitialPlanArrangeProjector(),
    );
    const adapter = new IcelandInitialPlanSolverAdapter();
    const dayAssign = new IcelandInitialPlanDayAssignSolver();
    const builder = new IcelandInitialPlanProposalBuilder();

    const tripId = 'trip_highland_branch_test';
    const { seed, arrange } = await pipeline.buildArrangeInput({
      tripId,
      travelDates: { startDate: '2026-07-22', endDate: '2026-07-30' },
      regionIds: ['south_coast', 'snaefellsnes', 'golden_circle', 'highlands'],
    });

    expect(
      seed.candidateEntities.some(
        (c) => c.packId === 'highlands' && c.countsTowardAttractionCoverage,
      ),
    ).toBe(true);

    const bundle = adapter.adapt(arrange, {
      startDate: '2026-07-22',
      endDate: '2026-07-30',
      maxActivitiesPerDay: 3,
      seed: parseInt(createHash('sha256').update(tripId).digest('hex').slice(0, 8), 16),
    });
    const solved = dayAssign.solve(bundle);
    expect(solved.response.status).not.toBe('INFEASIBLE');

    const candidate0 = solved.response.candidates[0]!;
    const proposal = builder.build({
      tripId,
      seed,
      arrange,
      bundle,
      candidate: candidate0,
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

    const highland = proposal.coverageSummary.find((r) => r.regionId === 'highlands');
    expect(highland?.countsTowardAttractionCoverage ?? 0).toBeGreaterThan(0);

    const highlandDays = proposal.days.filter((d) => (d.packIds ?? []).includes('highlands'));
    expect(highlandDays.length).toBeGreaterThan(0);
    for (const d of highlandDays) {
      const packs = new Set(d.packIds ?? []);
      expect([...packs].every((p) => p === 'highlands')).toBe(true);
    }
  });
});
