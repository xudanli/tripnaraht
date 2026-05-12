import { SpatialDomainAdminController } from './spatial-domain-admin.controller';

describe('SpatialDomainAdminController', () => {
  let c: SpatialDomainAdminController;
  let db: {
    pois: Map<string, any>;
    segments: Map<string, any>;
  };

  beforeEach(() => {
    db = { pois: new Map(), segments: new Map() };
    const prisma: any = {
      spatialDomainPoi: {
        findMany: jest.fn(async () => Array.from(db.pois.values())),
        findUnique: jest.fn(async ({ where }: any) => db.pois.get(where.id) ?? null),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.pois.get(where.id);
          const next = cur ? { ...cur, ...update } : { ...create, updatedAt: new Date().toISOString() };
          db.pois.set(where.id, next);
          return next;
        }),
      },
      spatialDomainSegment: {
        findMany: jest.fn(async () => Array.from(db.segments.values())),
        findUnique: jest.fn(async ({ where }: any) => db.segments.get(where.id) ?? null),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.segments.get(where.id);
          const next = cur ? { ...cur, ...update } : { ...create, updatedAt: new Date().toISOString() };
          db.segments.set(where.id, next);
          return next;
        }),
      },
    };
    c = new SpatialDomainAdminController(prisma);
  });

  it('creates poi and validates open window', async () => {
    await c.createPoi({
      id: 'poi-a',
      name: 'POI A',
      coordinates: { lat: 64.1, lng: -21.9 },
      time_windows: [{ weekday: 'DAILY', open: '09:00', close: '18:00' }],
      rules: [],
      capacity_limit: 100,
    });

    const out = await c.validatePoiTimeWindows('poi-a', { at: '2026-06-01T10:00:00.000Z' }) as any;
    expect(out.data.isOpen).toBe(true);
  });

  it('rejects invalid time window format', async () => {
    await expect(
      c.createPoi({
        id: 'poi-b',
        name: 'POI B',
        coordinates: { lat: 64.2, lng: -21.8 },
        time_windows: [{ weekday: 'MON-FRI', open: '9:00', close: '18:00' }],
      }),
    ).rejects.toThrow();
  });

  it('enforces segment poi refs and f-road vehicle rule', async () => {
    await c.createPoi({ id: 'p1', name: 'A', coordinates: { lat: 64, lng: -21 } });
    await c.createPoi({ id: 'p2', name: 'B', coordinates: { lat: 64.5, lng: -20.5 } });
    await c.createSegment({
      id: 's1',
      from_poi_id: 'p1',
      to_poi_id: 'p2',
      segment_type: 'F_ROAD',
      road_condition: { surface: 'GRAVEL', status: 'OPEN' },
    });

    const out = await c.validateSegmentFeasibility('s1', {
      enterAt: '2026-06-01T12:00:00.000Z',
      vehicleType: 'SEDAN',
    }) as any;
    expect(out.data.feasible).toBe(false);
    expect(out.data.violations).toContain('SEGMENT_REQUIRES_4X4');
  });

  it('marks endpoint closed when destination poi closed at eta', async () => {
    await c.createPoi({
      id: 'p3',
      name: 'From',
      coordinates: { lat: 65, lng: -20 },
      time_windows: [{ weekday: 'DAILY', open: '00:00', close: '23:59' }],
    });
    await c.createPoi({
      id: 'p4',
      name: 'To',
      coordinates: { lat: 65.1, lng: -20.1 },
      time_windows: [{ weekday: 'DAILY', open: '09:00', close: '10:00' }],
    });
    await c.createSegment({
      id: 's2',
      from_poi_id: 'p3',
      to_poi_id: 'p4',
      segment_type: 'HIGHWAY',
      road_condition: { status: 'OPEN' },
    });

    const out = await c.validateSegmentFeasibility('s2', {
      enterAt: '2026-06-01T12:00:00.000Z',
      vehicleType: 'SUV',
    }) as any;
    expect(out.data.feasible).toBe(false);
    expect(out.data.violations).toContain('POI_CLOSED_AT_ETA');
  });

  it('publishes map version', async () => {
    const out = await c.publishMap() as any;
    expect(out.data.publishedVersion).toBe(1);
  });
});
