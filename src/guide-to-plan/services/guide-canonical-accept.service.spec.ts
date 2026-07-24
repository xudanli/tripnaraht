import { GuideCanonicalAcceptService } from './guide-canonical-accept.service';
import { readPlanCandidateMeta, buildPersonaOpinions } from '../utils/guide-plan-candidate-meta.util';

function minimalDraft() {
  return {
    totalDays: 1,
    variant: 'balanced',
    sourceConfidence: 0.8,
    warnings: [],
    days: [
      {
        day: 1,
        date: '2026-08-01',
        items: [
          {
            name: '蓝湖',
            type: 'poi',
            source: 'guide',
            startTime: '10:00',
            endTime: '12:00',
          },
        ],
        activityCount: 1,
      },
    ],
  };
}

describe('GuideCanonicalAcceptService', () => {
  const originalFlag = process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE;
  const originalShadow = process.env.RFC001_SHADOW_MODE;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE;
    else process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = originalFlag;
    if (originalShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = originalShadow;
  });

  it('returns null when disabled', async () => {
    process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = '0';
    const service = new GuideCanonicalAcceptService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { ensureSnapshot: jest.fn(), capture: jest.fn().mockResolvedValue({ snapshotId: 'guide_ws_s1' }) } as any,
    );

    const result = await service.acceptAndExecute({
      userId: 'u1',
      sessionId: 's1',
      planCandidateId: 'c1',
      variant: 'balanced',
      itineraryDraft: minimalDraft(),
      travelContext: { startDate: '2026-08-01', countryCode: 'IS' },
      countryCode: 'IS',
    });

    expect(result).toBeNull();
  });

  it('returns null when candidate not finalized', async () => {
    process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = '1';
    process.env.RFC001_SHADOW_MODE = '0';

    const prisma = {
      guidePlanCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            variant: 'balanced',
            itineraryDraft: minimalDraft(),
            personaOpinions: buildPersonaOpinions({ decisionEngineStatus: 'applied' }),
          },
        ]),
      },
    };

    const service = new GuideCanonicalAcceptService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { ensureSnapshot: jest.fn(), capture: jest.fn().mockResolvedValue({ snapshotId: 'guide_ws_s1' }) } as any,
    );

    const result = await service.acceptAndExecute({
      userId: 'u1',
      sessionId: 's1',
      planCandidateId: 'c1',
      variant: 'balanced',
      itineraryDraft: minimalDraft(),
      travelContext: { startDate: '2026-08-01', countryCode: 'IS' },
      countryCode: 'IS',
    });

    expect(result).toBeNull();
  });

  it('runs finalize → authorize → execute when enabled and finalized', async () => {
    process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = '1';
    process.env.RFC001_SHADOW_MODE = '0';

    const materializer = {
      materializeShell: jest.fn().mockResolvedValue({ tripId: 'trip_1', startDate: '2026-08-01' }),
    };
    const fullPlanSelection = {
      evaluatePrebuiltCandidates: jest.fn().mockResolvedValue({
        problemId: 'guide_accept_s1_1',
        candidates: [
          {
            candidateId: 'balanced',
            plan: {
              version: 'v1',
              createdAt: '',
              days: [
                {
                  day: 1,
                  date: '2026-08-01',
                  timeSlots: [
                    { id: 's1', time: '10:00', title: 'A', type: 'sightseeing' },
                    { id: 's2', time: '12:00', title: 'B', type: 'sightseeing' },
                    { id: 's3', time: '14:00', title: 'C', type: 'sightseeing' },
                  ],
                },
              ],
            },
            label: '平衡',
            source: 'LEGACY_TRIP_PLANNING',
            createdAt: '',
          },
        ],
        constraintReports: { balanced: { assertions: [], overallStatus: 'UNVERIFIED' } },
      }),
    };
    const workspaceService = { save: jest.fn().mockResolvedValue(undefined) };
    const problemStore = { upsert: jest.fn().mockResolvedValue(undefined) };
    const finalizeService = {
      finalizeWorkspace: jest.fn().mockResolvedValue({
        record: { decisionId: 'dec_1', selectedCandidateId: 'balanced' },
      }),
    };
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ record: { decisionId: 'dec_1' } }),
    };
    const executor = {
      execute: jest.fn().mockResolvedValue({
        planVersion: { planVersionId: 'plan_v1' },
      }),
    };

    const prisma = {
      guideInspirationCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      guidePlanCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            variant: 'balanced',
            itineraryDraft: minimalDraft(),
            personaOpinions: buildPersonaOpinions({
              decisionEngineStatus: 'finalized',
              canonical: {
                finalized: true,
                recommended: true,
                decisionId: 'dec_preview',
                overallStatus: 'UNVERIFIED',
              },
            }),
          },
        ]),
      },
      guideToPlanSession: {
        findUnique: jest.fn().mockResolvedValue({ understandingSummary: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      trip: {
        findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const worldStateSnapshot = {
      capture: jest.fn().mockResolvedValue({ snapshotId: 'guide_ws_s1' }),
    };

    const service = new GuideCanonicalAcceptService(
      prisma as any,
      materializer as any,
      fullPlanSelection as any,
      workspaceService as any,
      problemStore as any,
      finalizeService as any,
      authorization as any,
      executor as any,
      worldStateSnapshot as any,
    );

    const result = await service.acceptAndExecute({
      userId: 'u1',
      sessionId: 's1',
      planCandidateId: 'c1',
      variant: 'balanced',
      itineraryDraft: minimalDraft(),
      travelContext: { startDate: '2026-08-01', countryCode: 'IS', transportMode: 'self_drive' },
      countryCode: 'IS',
    });

    expect(result).toEqual({
      tripId: 'trip_1',
      itemCount: 3,
      decisionId: 'dec_1',
      effectivePlanVersionId: 'plan_v1',
      canonicalExecuted: true,
    });
    expect(fullPlanSelection.evaluatePrebuiltCandidates).toHaveBeenCalled();
    expect(worldStateSnapshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'trip_1', snapshotId: 'guide_ws_s1' }),
    );
    expect(finalizeService.finalizeWorkspace).toHaveBeenCalled();
    expect(authorization.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'trip_1', choice: 'balanced' }),
    );
    expect(executor.execute).toHaveBeenCalledWith({ tripId: 'trip_1', decisionId: 'dec_1' });

    const meta = readPlanCandidateMeta(
      buildPersonaOpinions({
        decisionEngineStatus: 'finalized',
        canonical: { finalized: true, recommended: true, decisionId: 'dec_preview' },
      }),
    );
    expect(meta.finalized).toBe(true);
  });
});
