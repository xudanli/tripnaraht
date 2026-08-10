import { ItemType } from '@prisma/client';
import { IcelandInitialPlanArrangeService } from './iceland-initial-plan-arrange.service';

describe('IcelandInitialPlanArrangeService', () => {
  function makeDays(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `day-${i + 1}`,
      date: new Date(Date.UTC(2027, 1, 10 + i)),
    }));
  }

  function makeCandidates(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `cand-${i + 1}`,
      placeId: 100 + i,
      priority: 'must_go',
      sortOrder: i,
      createdAt: new Date(),
      Place: {
        nameCN: `景点${i + 1}`,
        nameEN: `Place ${i + 1}`,
        metadata: { suggestedDwellMinutes: 90 },
      },
    }));
  }

  it('coverage-first: 9 days / 11 candidates → assigned days >= 9', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn().mockResolvedValue(makeDays(9)) },
      tripAttractionExploreCandidate: {
        findMany: jest.fn().mockResolvedValue(makeCandidates(11)),
      },
    };
    const svc = new IcelandInitialPlanArrangeService(prisma as never);
    const result = await svc.buildInitialArrangeChanges({ tripId: 't1' });

    expect(result).not.toBeNull();
    expect(result!.authority).toBe('coverage');
    expect(result!.assignedDayCount).toBe(9);
    expect(result!.activityCount).toBe(11);
    expect(result!.emptyDayCountEstimate).toBe(0);

    const adds = result!.changes.filter((c) => c.operation === 'ADD');
    const dayIndexes = new Set(adds.map((c) => c.dayIndex));
    expect(dayIndexes.size).toBe(9);
    expect(adds.every((c) => c.removeFromCandidates === true)).toBe(true);
    expect(adds.every((c) => c.itemType === ItemType.ACTIVITY)).toBe(true);
    expect(adds.every((c) => !c.note?.includes('[ortools-shadow]'))).toBe(true);
  });

  it('rewrites times with OR-Tools when solver returns day plan', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn().mockResolvedValue(makeDays(1)) },
      tripAttractionExploreCandidate: {
        findMany: jest.fn().mockResolvedValue(makeCandidates(2)),
      },
    };
    const solverClient = {
      solve: jest.fn().mockResolvedValue({
        candidates: [
          {
            label: 'best',
            objectiveValue: 1,
            operation: 'SWAP',
            dayPlans: [
              {
                dayId: 'd1',
                nodeIds: ['depot', 'cand-2', 'cand-1'],
                startMin: [540, 600, 720],
              },
            ],
          },
        ],
      }),
    };

    const prev = process.env.OR_TOOLS_SOLVER_URL;
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:9999';
    try {
      const svc = new IcelandInitialPlanArrangeService(
        prisma as never,
        solverClient as never,
      );
      const result = await svc.buildInitialArrangeChanges({ tripId: 't1' });
      expect(result!.authority).toBe('coverage_ortools');
      const adds = result!.changes.filter((c) => c.operation === 'ADD');
      expect(adds[0]!.candidateId).toBe('cand-2');
      expect(adds[0]!.startTime).toBe('10:00');
      expect(adds[0]!.note).toContain('[ortools-initial]');
      expect(adds.every((c) => !c.note?.includes('[ortools-shadow]'))).toBe(true);
      expect(solverClient.solve).toHaveBeenCalled();
    } finally {
      if (prev == null) delete process.env.OR_TOOLS_SOLVER_URL;
      else process.env.OR_TOOLS_SOLVER_URL = prev;
    }
  });

  it('keeps coverage authority when solver fails', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn().mockResolvedValue(makeDays(2)) },
      tripAttractionExploreCandidate: {
        findMany: jest.fn().mockResolvedValue(makeCandidates(3)),
      },
    };
    const solverClient = {
      solve: jest.fn().mockRejectedValue(new Error('sidecar down')),
    };
    const prev = process.env.OR_TOOLS_SOLVER_URL;
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:9999';
    try {
      const svc = new IcelandInitialPlanArrangeService(
        prisma as never,
        solverClient as never,
      );
      const result = await svc.buildInitialArrangeChanges({ tripId: 't1' });
      expect(result!.authority).toBe('coverage');
      expect(result!.activityCount).toBe(3);
    } finally {
      if (prev == null) delete process.env.OR_TOOLS_SOLVER_URL;
      else process.env.OR_TOOLS_SOLVER_URL = prev;
    }
  });

  it('returns null when no candidates', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn().mockResolvedValue(makeDays(3)) },
      tripAttractionExploreCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const svc = new IcelandInitialPlanArrangeService(prisma as never);
    expect(await svc.buildInitialArrangeChanges({ tripId: 't1' })).toBeNull();
  });
});
