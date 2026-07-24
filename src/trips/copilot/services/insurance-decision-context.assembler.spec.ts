import { InsuranceDecisionContextAssembler } from './insurance-decision-context.assembler';

describe('InsuranceDecisionContextAssembler', () => {
  it('marks gate CONTEXT_MISSING without vehicle and route', async () => {
    const prisma = {
      trip: {
        findUnique: async () => ({
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-10'),
          metadata: {},
          budgetConfig: {},
        }),
      },
      tripDay: { count: async () => 0 },
    };
    const asm = new InsuranceDecisionContextAssembler(prisma as never);
    const ctx = await asm.assemble('trip_t');
    expect(ctx.gate.ok).toBe(false);
    expect(ctx.gate.code).toBe('CONTEXT_MISSING');
    expect(ctx.gate.missing).toEqual(
      expect.arrayContaining(['ROUTE_SUMMARY', 'VEHICLE_BOOKING']),
    );
    expect(ctx.fields.selfDriveSeason.status).toBe('CONFIRMED');
  });

  it('gate ok when days + vehicle_type present; gravel fact confirmed', async () => {
    const prisma = {
      trip: {
        findUnique: async () => ({
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-10'),
          metadata: {
            constraints: { vehicle_type: 'SUV' },
            routeDecisionFlags: { hasGravel: true },
          },
          budgetConfig: { total: 5000, currency: 'EUR' },
        }),
      },
      tripDay: { count: async () => 8 },
    };
    const asm = new InsuranceDecisionContextAssembler(prisma as never);
    const ctx = await asm.assemble('trip_t');
    expect(ctx.gate.ok).toBe(true);
    expect(ctx.fields.routeSummary.status).toBe('CONFIRMED');
    expect(ctx.fields.vehicleBooking.status).toBe('CONFIRMED');
    expect(ctx.fields.roadExposure.status).toBe('CONFIRMED');
    expect(ctx.confirmedFacts.some((f) => f.includes('碎石'))).toBe(true);
  });
});
