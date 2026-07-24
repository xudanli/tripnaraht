/**
 * Dev trip smoke — PlanObject projection API (skips when DB/trip unavailable).
 */

import { PrismaClient } from '@prisma/client';
import { PlanObjectProjectionService } from './services/plan-object-projection.service';

const DEV_TRIPS = [
  { id: '510d95ce-7cc4-4a07-8aba-2d4694451a3c', label: 'South coast' },
  { id: '3e4a1058-9218-467f-988a-c18008a14385', label: 'F208' },
] as const;

describe('PlanObjectProjectionService — dev trips', () => {
  const prisma = new PrismaClient();
  let service: PlanObjectProjectionService;

  beforeAll(() => {
    process.env.PLAN_OBJECT_PROJECTION_ENABLED = '1';
    service = new PlanObjectProjectionService(prisma as never);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(DEV_TRIPS)('CAS-050: projects $label trip ($id)', async ({ id, label }) => {
    const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
    if (!trip) {
      // eslint-disable-next-line no-console
      console.warn(`[CAS-050] skip ${label}: trip ${id} not in DB`);
      return;
    }

    const view = await service.buildProjection(id);
    expect(view.schemaId).toBe('tripnara.plan_object_projection@v1');
    expect(view.tripId).toBe(id);
    expect(view.days.length).toBeGreaterThan(0);

    const types = new Set(view.days.flatMap((d) => d.objects.map((o) => o.type)));
    // eslint-disable-next-line no-console
    console.log(
      `[CAS-050] ${label}: days=${view.days.length} objects=${view.summary.totalObjects} types=${[...types].join(',')} assessments=${view.summary.assessmentCount}`,
    );

    expect(view.summary.totalObjects).toBeGreaterThan(0);
    expect(types.size).toBeGreaterThan(0);
  });
});
