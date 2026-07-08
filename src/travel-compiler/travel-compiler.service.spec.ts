import { TravelCompilerService } from './travel-compiler.service';
import { PoiAliasRegistryService } from '../canonical-poi-resolution/services/poi-alias-registry.service';
import { CanonicalPoiResolutionService } from '../canonical-poi-resolution/services/canonical-poi-resolution.service';
import { itineraryToPlannerDraftIR } from './utils/itinerary-to-planner-draft-ir.util';
import type { Itinerary } from '../agent/interfaces/trip-plan.interface';

describe('TravelCompilerService', () => {
  const registry = {
    getCatalog: jest.fn().mockReturnValue([
      {
        poiId: 'is.blue_lagoon',
        canonicalName: 'Blue Lagoon',
        aliases: ['蓝湖'],
        country: 'IS',
        status: 'ACTIVE',
      },
      {
        poiId: 'is.reynisfjara',
        canonicalName: 'Reynisfjara',
        aliases: ['黑沙滩'],
        country: 'IS',
        status: 'ACTIVE',
      },
    ]),
    getByPoiId: jest.fn((id: string) =>
      id === 'is.blue_lagoon'
        ? { poiId: 'is.blue_lagoon', canonicalName: 'Blue Lagoon', aliases: [], country: 'IS', status: 'ACTIVE' }
        : id === 'is.reynisfjara'
          ? { poiId: 'is.reynisfjara', canonicalName: 'Reynisfjara', aliases: [], country: 'IS', status: 'ACTIVE' }
          : undefined,
    ),
  };

  const prisma = { poiResolutionLog: { create: jest.fn().mockResolvedValue({}) } };

  const cpre = new CanonicalPoiResolutionService(
    registry as unknown as PoiAliasRegistryService,
    prisma as never,
  );
  const service = new TravelCompilerService(cpre);

  it('compiles Iceland POI draft to graph with matched nodes', async () => {
    const itinerary: Itinerary = {
      request_id: 'req_test',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'i1',
              type: 'POI',
              start_window: '09:00',
              end_window: '11:00',
              location_ref: { name: '蓝湖' },
              evidence_refs: [],
              verified: false,
            },
            {
              id: 'i2',
              type: 'POI',
              start_window: '14:00',
              end_window: '16:00',
              location_ref: { name: '黑沙滩' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };

    const draft = itineraryToPlannerDraftIR({
      itinerary,
      tripPlanRequest: { destination: 'IS' } as never,
      source: 'agent_planner',
    });

    const result = await service.compile(draft, { countryCode: 'IS', allowPartialGraph: true });

    expect(result.status).toBe('partial');
    expect(result.engine).toBe('CTRE');
    expect(result.graph?.stats.poiResolved).toBe(2);
    expect(result.graph?.nodes.some((n) => n.kind === 'POI' && n.canonical?.poiId === 'is.blue_lagoon')).toBe(
      true,
    );
    expect(result.phaseReports.some((p) => p.phase === 'CANONICALIZATION' && p.status === 'done')).toBe(true);
    expect(result.score).toBeGreaterThan(80);
    expect(result.graph?.bookings.length).toBeGreaterThan(0);
    expect(result.phaseReports.find((p) => p.phase === 'LINKING')?.counters?.Dependency).toBeDefined();
  });

  it('expands Golden Circle route template via ROUTE_RESOLUTION phase', async () => {
    const draft = itineraryToPlannerDraftIR({
      itinerary: {
        request_id: 'req_gc',
        days: [
          {
            date: '2026-08-03',
            items: [
              {
                id: 'gc1',
                type: 'POI',
                start_window: '09:00',
                end_window: '17:00',
                location_ref: { name: 'Golden Circle' },
                evidence_refs: [],
                verified: false,
              },
            ],
          },
        ],
      },
      tripPlanRequest: { destination: 'IS' } as never,
    });

    expect(draft.days[0]?.slots[0]?.hintType).toBe('route');

    const result = await service.compile(draft, { countryCode: 'IS', allowPartialGraph: true });

    expect(result.graph?.stats.routeTemplatesResolved).toBe(1);
    expect(result.graph?.stats.routeSegmentsResolved).toBe(2);
    expect(result.graph?.nodes.some((n) => n.kind === 'ROUTE')).toBe(true);
    expect(result.phaseReports.find((p) => p.phase === 'ROUTE_RESOLUTION')?.status).toBe('done');
    expect(result.phaseReports.find((p) => p.phase === 'ROUTE_RESOLUTION')?.counters?.Route).toEqual({
      done: 1,
      total: 1,
    });
  });

  it('returns partial when POI not found with allowPartialGraph', async () => {
    const draft = itineraryToPlannerDraftIR({
      itinerary: {
        request_id: 'req_x',
        days: [
          {
            date: '2026-08-02',
            items: [
              {
                id: 'x1',
                type: 'POI',
                start_window: '10:00',
                end_window: '11:00',
                location_ref: { name: 'Totally Unknown Place XYZ' },
                evidence_refs: [],
                verified: false,
              },
            ],
          },
        ],
      },
      tripPlanRequest: { destination: 'IS' } as never,
    });

    const result = await service.compile(draft, { countryCode: 'IS', allowPartialGraph: true });
    expect(result.status).toBe('partial');
    expect(result.errors.some((e) => e.code === 'POI_NOT_FOUND')).toBe(true);
    expect(result.graph).toBeDefined();
  });
});

describe('itineraryToPlannerDraftIR', () => {
  it('maps itinerary items to planner slots', () => {
    const draft = itineraryToPlannerDraftIR({
      itinerary: {
        request_id: 'r1',
        days: [{ date: '2026-01-01', items: [] }],
      },
      tripPlanRequest: { destination: 'Iceland' } as never,
    });
    expect(draft.destination.countryCode).toBe('IS');
    expect(draft.schemaId).toBe('tripnara.planner_draft_ir@v0');
  });
});
