import { DecisionWorkspaceReadService } from './decision-workspace-read.service';

describe('DecisionWorkspaceReadService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, DECISION_RUNTIME_READ_FROM_PROJECTION: 'false' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns gate1 bundle when projection flag is off', async () => {
    const prisma = {
      gate1ConflictReport: { findMany: jest.fn().mockResolvedValue([]) },
      gate1CandidateStrategy: { findMany: jest.fn().mockResolvedValue([]) },
      gate1AdvisorDecision: { findMany: jest.fn().mockResolvedValue([{ id: 'd1' }]) },
      gate1ReadinessReport: { findMany: jest.fn().mockResolvedValue([]) },
      gate1PlanB: { findMany: jest.fn().mockResolvedValue([]) },
      gate1ProjectOutcome: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const reconciliation = { reconcileProject: jest.fn() };
    const service = new DecisionWorkspaceReadService(
      prisma as never,
      reconciliation as never,
    );

    const ws = await service.getWorkspace('proj-1');

    expect(ws.meta.readModelSource).toBe('gate1');
    expect(ws.decisions).toHaveLength(1);
    expect(reconciliation.reconcileProject).not.toHaveBeenCalled();
  });

  it('falls back when projection flag on but reconciliation mismatches', async () => {
    process.env.DECISION_RUNTIME_READ_FROM_PROJECTION = 'true';

    const prisma = {
      gate1ConflictReport: { findMany: jest.fn().mockResolvedValue([]) },
      gate1CandidateStrategy: { findMany: jest.fn().mockResolvedValue([]) },
      gate1AdvisorDecision: { findMany: jest.fn().mockResolvedValue([{ id: 'd1' }]) },
      gate1ReadinessReport: { findMany: jest.fn().mockResolvedValue([]) },
      gate1PlanB: { findMany: jest.fn().mockResolvedValue([]) },
      gate1ProjectOutcome: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const reconciliation = {
      reconcileProject: jest.fn().mockResolvedValue({
        skippedReason: undefined,
        allMatched: false,
        tripId: 'trip-1',
        projection: { sourceEventCount: 1, conflictReports: [], candidates: [], decisions: [], planBs: [], readinessBlockers: [] },
        entities: [{ entity: 'decisions', matched: false, gate1Count: 1, eventCount: 0, missingInEvents: ['d1'], extraInEvents: [] }],
      }),
    };
    const service = new DecisionWorkspaceReadService(
      prisma as never,
      reconciliation as never,
    );

    const ws = await service.getWorkspace('proj-1');

    expect(ws.meta.readModelSource).toBe('projection_fallback');
    expect(ws.meta.reconciliationMatched).toBe(false);
    expect(ws.meta.validationWarnings.length).toBeGreaterThan(0);
  });
});
