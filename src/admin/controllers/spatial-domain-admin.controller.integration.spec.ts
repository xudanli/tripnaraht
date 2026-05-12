import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SpatialDomainAdminController } from './spatial-domain-admin.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('SpatialDomainAdminController (integration)', () => {
  let app: INestApplication;
  const db = {
    pois: new Map<string, any>(),
    segments: new Map<string, any>(),
  };

  const prismaMock: any = {
    spatialDomainPoi: {
      findMany: jest.fn(async () => Array.from(db.pois.values())),
      findUnique: jest.fn(async ({ where }: any) => db.pois.get(where.id) ?? null),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const cur = db.pois.get(where.id);
        const next = cur
          ? { ...cur, ...update, updatedAt: new Date().toISOString() }
          : { ...create, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        db.pois.set(where.id, next);
        return next;
      }),
    },
    spatialDomainSegment: {
      findMany: jest.fn(async () => Array.from(db.segments.values())),
      findUnique: jest.fn(async ({ where }: any) => db.segments.get(where.id) ?? null),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const cur = db.segments.get(where.id);
        const next = cur
          ? { ...cur, ...update, updatedAt: new Date().toISOString() }
          : { ...create, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        db.segments.set(where.id, next);
        return next;
      }),
    },
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SpatialDomainAdminController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    db.pois.clear();
    db.segments.clear();
    jest.clearAllMocks();
  });

  it('creates poi then reads it back', async () => {
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/pois')
      .send({
        id: 'poi-1',
        name: 'Landmannalaugar',
        coordinates: { lat: 63.98, lng: -19.06 },
        time_windows: [{ weekday: 'DAILY', open: '09:00', close: '18:00' }],
      })
      .expect(201);

    const getRes = await request(app.getHttpServer()).get('/admin/spatial-domain/pois/poi-1').expect(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.id).toBe('poi-1');
    expect(getRes.body.data.name).toBe('Landmannalaugar');
  });

  it('blocks segment creation when poi refs are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/spatial-domain/segments')
      .send({
        id: 'seg-x',
        from_poi_id: 'missing-a',
        to_poi_id: 'missing-b',
        segment_type: 'F_ROAD',
      })
      .expect(400);
    expect(String(res.body.message)).toContain('POI not found');
  });

  it('returns HARD violations for F_ROAD + closed endpoint', async () => {
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/pois')
      .send({
        id: 'poi-a',
        name: 'From',
        coordinates: { lat: 64.0, lng: -21.0 },
        time_windows: [{ weekday: 'DAILY', open: '00:00', close: '23:59' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/pois')
      .send({
        id: 'poi-b',
        name: 'To',
        coordinates: { lat: 64.5, lng: -20.5 },
        time_windows: [{ weekday: 'DAILY', open: '09:00', close: '10:00' }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/spatial-domain/segments')
      .send({
        id: 'seg-1',
        from_poi_id: 'poi-a',
        to_poi_id: 'poi-b',
        segment_type: 'F_ROAD',
        road_condition: { status: 'OPEN', surface: 'GRAVEL' },
      })
      .expect(201);

    const validateRes = await request(app.getHttpServer())
      .post('/admin/spatial-domain/segments/seg-1/validate-feasibility')
      .send({
        enterAt: '2026-06-01T12:00:00.000Z',
        vehicleType: 'SEDAN',
      })
      .expect(201);

    expect(validateRes.body.data.feasible).toBe(false);
    expect(validateRes.body.data.violations).toContain('SEGMENT_REQUIRES_4X4');
    expect(validateRes.body.data.violations).toContain('POI_CLOSED_AT_ETA');
  });

  it('patches segment status and reflects closed-road violation', async () => {
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/pois')
      .send({
        id: 'poi-c',
        name: 'C',
        coordinates: { lat: 65.0, lng: -21.1 },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/pois')
      .send({
        id: 'poi-d',
        name: 'D',
        coordinates: { lat: 65.1, lng: -21.2 },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/spatial-domain/segments')
      .send({
        id: 'seg-2',
        from_poi_id: 'poi-c',
        to_poi_id: 'poi-d',
        segment_type: 'HIGHWAY',
        road_condition: { status: 'OPEN', surface: 'PAVED' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/admin/spatial-domain/segments/seg-2')
      .send({ road_condition: { status: 'CLOSED', surface: 'PAVED' } })
      .expect(200);

    const validateRes = await request(app.getHttpServer())
      .post('/admin/spatial-domain/segments/seg-2/validate-feasibility')
      .send({ enterAt: '2026-06-01T12:00:00.000Z', vehicleType: 'SUV' })
      .expect(201);
    expect(validateRes.body.data.feasible).toBe(false);
    expect(validateRes.body.data.violations).toContain('SEGMENT_ROAD_CLOSED');
  });
});
