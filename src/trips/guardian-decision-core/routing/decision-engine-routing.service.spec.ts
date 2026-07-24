import { Rfc001DecisionEngineRoutingService } from './decision-engine-routing.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';

function createMockPrisma(destination?: string) {
  return {
    trip: {
      findUnique: jest.fn(async () =>
        destination ? { destination } : null,
      ),
    },
  };
}

describe('Rfc001DecisionEngineRoutingService', () => {
  const prevFlag = process.env.RFC001_ICELAND_ROAD_CLOSE;
  const prevCanonical = process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    else process.env.RFC001_ICELAND_ROAD_CLOSE = prevFlag;
    if (prevCanonical === undefined) delete process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE;
    else process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE = prevCanonical;
  });

  it('ROUTE-001: trip without active pack → LEGACY_V15 only when flag on', async () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '1';
    const prisma = createMockPrisma('JP') as unknown as PrismaService;
    const problemStore = {
      list: jest.fn(async () => []),
    } as unknown as Rfc001DecisionProblemStoreService;
    const svc = new Rfc001DecisionEngineRoutingService(prisma, problemStore);

    const routing = await svc.getTripRouting('trip_jp');
    expect(routing.engines.map((e) => e.engineId)).toEqual(['LEGACY_V15']);
    expect(routing.defaultEngine).toBe('LEGACY_V15');
  });

  it('ROUTE-002: trip with active country pack + flag → Canonical + LEGACY fallback', async () => {
    process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE = '1';
    delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    const prisma = createMockPrisma('IS') as unknown as PrismaService;
    const problemStore = {
      list: jest.fn(async () => []),
    } as unknown as Rfc001DecisionProblemStoreService;
    const svc = new Rfc001DecisionEngineRoutingService(prisma, problemStore);

    const routing = await svc.getTripRouting('trip_is');
    expect(routing.engines.map((e) => e.engineId)).toEqual([
      'CANONICAL_DECISION_RUNTIME',
      'LEGACY_V15',
    ]);
    expect(routing.engines[0].apis.decisionCenter).toContain('decision-center');
  });

  it('ROUTE-003: Canonical problem id routes to Canonical engine', async () => {
    process.env.RFC001_ICELAND_ROAD_CLOSE = '1';
    const prisma = createMockPrisma('IS') as unknown as PrismaService;
    const problemStore = {
      list: jest.fn(async () => [
        {
          problemId: 'problem_f208',
          type: 'FEASIBILITY_FAILURE',
          triggerEventId: 'evt_1',
        },
      ]),
    } as unknown as Rfc001DecisionProblemStoreService;
    const svc = new Rfc001DecisionEngineRoutingService(prisma, problemStore);

    const routing = await svc.getTripRouting('trip_is');
    expect(routing.problemRoutes[0].engineId).toBe('CANONICAL_DECISION_RUNTIME');
    expect(
      svc.resolveEngineForProblem(routing, 'problem_f208'),
    ).toBe('CANONICAL_DECISION_RUNTIME');
    expect(
      svc.resolveEngineForProblem(routing, 'legacy_gate_problem'),
    ).toBe('LEGACY_V15');
  });

  it('ROUTE-004: NZ trip with active pack + flag → Canonical runtime', async () => {
    process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE = '1';
    const prisma = createMockPrisma('NZ') as unknown as PrismaService;
    const problemStore = {
      list: jest.fn(async () => []),
    } as unknown as Rfc001DecisionProblemStoreService;
    const svc = new Rfc001DecisionEngineRoutingService(prisma, problemStore);

    const routing = await svc.getTripRouting('trip_nz');
    expect(routing.engines.map((e) => e.engineId)).toEqual([
      'CANONICAL_DECISION_RUNTIME',
      'LEGACY_V15',
    ]);
    expect(routing.engines[0].match.destinationCountries).toEqual(['NZ']);
  });
});
