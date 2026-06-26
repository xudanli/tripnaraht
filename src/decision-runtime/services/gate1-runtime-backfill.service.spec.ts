import { Gate1RuntimeBackfillService } from './gate1-runtime-backfill.service';
import { Gate1RuntimeEventService } from './gate1-runtime-event.service';

describe('Gate1RuntimeBackfillService', () => {
  it('skips when no linkedTripId', async () => {
    const runtimeEvents = {
      resolveAnchor: jest.fn().mockResolvedValue(null),
    };
    const backfill = new Gate1RuntimeBackfillService({} as never, runtimeEvents as never);

    const result = await backfill.backfillProject('proj-1');

    expect(result.skippedNoTrip).toBe(true);
    expect(result.attempted).toBe(0);
  });

  it('backfills decisions when anchor exists', async () => {
    const runtimeEvents = {
      resolveAnchor: jest.fn().mockResolvedValue({
        tripId: 'trip-1',
        gate1ProjectId: 'proj-1',
      }),
      participantConsented: jest.fn(),
      constraintRecorded: jest.fn(),
      privateConstraintSummarized: jest.fn(),
      conflictDetected: jest.fn(),
      conflictAdvisorFeedback: jest.fn(),
      candidateStrategyCreated: jest.fn(),
      decisionRecorded: jest.fn().mockResolvedValue({ persisted: true, eventId: 'e1' }),
      readinessBlockerRaised: jest.fn(),
      contingencyPlanCreated: jest.fn(),
      outcomeRecorded: jest.fn(),
    };

    const prisma = {
      gate1Project: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'proj-1',
          participants: [],
          decisions: [{ id: 'dec-1', materialChange: true, changeTypes: [], submittedBy: 'adv-1', selectedCandidateId: null, conflictReportVersion: null }],
          conflictReports: [],
          candidateStrategies: [],
          planBs: [],
          outcome: null,
          sanitizedConstraints: [],
          readinessReports: [],
        }),
      },
    };

    const backfill = new Gate1RuntimeBackfillService(prisma as never, runtimeEvents as never);
    const result = await backfill.backfillProject('proj-1');

    expect(result.skippedNoTrip).toBe(false);
    expect(result.persisted).toBeGreaterThanOrEqual(1);
    expect(runtimeEvents.decisionRecorded).toHaveBeenCalledWith(
      expect.objectContaining({ decisionId: 'dec-1' }),
    );
  });
});
