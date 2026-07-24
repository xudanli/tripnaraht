import { CanonicalCausalTraceService } from './canonical-causal-trace.service';

describe('CanonicalCausalTraceService calibration replay', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn().mockResolvedValue({ updatedAt: new Date(), destination: 'IS' }),
    },
  } as unknown as ConstructorParameters<typeof CanonicalCausalTraceService>[0];

  let service: CanonicalCausalTraceService;

  beforeEach(() => {
    service = new CanonicalCausalTraceService(prisma);
  });

  it('findBestTraceForProblem prefers CALIBRATED over newer PREVIEW', async () => {
    const tripId = 'trip-1';
    const problemId = 'problem-1';
    const old = await service.ensureProblemTrace({
      tripId,
      problemId,
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
    });
    service.bindCalibrated({
      traceId: old.traceId,
      outcomeRef: 'res-1',
      predictedMinutes: 27,
      actualMinutes: 30,
      verdict: 'CONFIRMED',
    });

    await service.ensureProblemTrace({
      tripId,
      problemId,
      worldStateVersion: 'ws_v2',
      semanticKey: 'travel',
    });

    const best = service.findBestTraceForProblem(tripId, problemId);
    expect(best?.traceId).toBe(old.traceId);
    expect(best?.status).toBe('CALIBRATED');
  });
});
