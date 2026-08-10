import { IcelandSelfDriveBootstrapService } from './iceland-self-drive-bootstrap.service';

describe('IcelandSelfDriveBootstrapService', () => {
  const baseIsd = {
    productLine: 'iceland_self_drive',
    idempotencyKey: 'k',
    contextVersion: 'cv_1',
    generationStatus: 'READY',
    wizard: {
      destinationCode: 'IS',
      productLine: 'iceland_self_drive',
      dateRange: { startDate: '2027-02-10', endDate: '2027-02-18' },
      arrivalAt: null,
      departureAt: null,
      travelerCount: 2,
      startLocationCode: 'keflavik',
      endLocationCode: 'keflavik',
      endSameAsStart: true,
      vehicleAcquisition: 'rent',
      regionIds: ['south_coast'],
      bookings: [],
      skipBookings: true,
      fillBookingsLater: false,
    },
    drivingSettings: {
      vehicle: {
        lifecycleStatus: 'not_rented',
        acquisition: 'rent',
        rentalCompanyId: null,
        rentalCompanyName: null,
        vehicleClass: null,
        vehicleClassLabel: null,
        is4wd: null,
        fuelType: null,
        isHighBody: null,
        estimatedRangeKm: null,
        pickupAt: null,
        rentalRestrictions: [],
        source: 'manual',
        recognitionSummary: null,
      },
      drivers: {
        driverCount: null,
        experienceLevel: null,
        dailyDrivingLimitHours: null,
        arrivalDayDriving: null,
        candidates: [],
      },
      members: { hasChildren: false, hasElderly: false, motionSickness: false },
      routePreference: {
        pacePreference: 'balanced',
        dailyDrivingLimitHours: null,
        useSystemRest: true,
        restFrequency: 'normal',
        arrivalDayDriving: null,
        gravelTolerance: 'moderate',
        allowNightDriving: false,
        nightDrivingPreference: 'avoid',
        fRoadPreference: 'avoid',
        waterCrossingPreference: 'avoid',
        highWindPreference: 'avoid',
      },
      fuel: {
        fuelType: null,
        refuelStrategy: 'early',
        useDynamicSafetyMargin: true,
        safetyMarginPercent: null,
        configured: false,
      },
      insurance: {
        userAcknowledgedCodes: [],
        preferredUpgradeCodes: [],
        configured: false,
      },
    },
    routeSkeleton: {
      strategyId: 'depth-south-coast',
      regionSummary: '南岸',
      days: [],
    },
    hardAnchors: [],
    warnings: [{ code: 'INITIAL_SCHEDULE_PARTIAL', message: 'partial' }],
    createdAt: '2027-01-01T00:00:00.000Z',
    initialPlan: {
      status: 'PARTIAL',
      verificationStatus: 'WARN',
      scheduledDayCount: 9,
      scheduledActivityCount: 0,
      scheduledAnchorCount: 2,
      emptyDayCount: 7,
      lastProposalId: 'prop-1',
      fallbackAllowed: false,
      applyReason: 'INITIAL_PLAN_CREATION',
      authorizationSource: 'CREATE_WIZARD_SUBMISSION',
      generatedAt: '2027-01-01T00:00:00.000Z',
      warnings: [{ code: 'INITIAL_SCHEDULE_PARTIAL', message: 'partial' }],
    },
  };

  it('returns nested initialPlan and forces GENERATING while RUNNING', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-1',
          metadata: {
            icelandSelfDrive: { ...baseIsd, generationStatus: 'RUNNING' },
          },
          TripCollaborator: [{ userId: 'user-1' }],
        }),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'd1', ItineraryItem: [] },
        ]),
      },
    };

    const svc = new IcelandSelfDriveBootstrapService(prisma as never);
    const res = await svc.getBootstrap('user-1', 'trip-1');

    expect(res.generationStatus).toBe('RUNNING');
    expect(res.initialPlan.status).toBe('GENERATING');
    expect(res.initialPlan.fallbackAllowed).toBe(false);
    expect(res.initialScheduleReady).toBe(false);
  });

  it('returns schedule readiness fields from stored initialPlan', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-1',
          metadata: { icelandSelfDrive: baseIsd },
          TripCollaborator: [{ userId: 'user-1' }],
        }),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            ItineraryItem: [{ type: 'REST', bookingStatus: 'CONFIRMED' }],
          },
          {
            id: 'd2',
            ItineraryItem: [{ type: 'REST', bookingStatus: 'CONFIRMED' }],
          },
        ]),
      },
    };

    const svc = new IcelandSelfDriveBootstrapService(prisma as never);
    const res = await svc.getBootstrap('user-1', 'trip-1');

    expect(res.generationStatus).toBe('READY');
    expect(res.initialPlan.status).toBe('PARTIAL');
    expect(res.initialPlan.scheduledAnchorCount).toBe(2);
    expect(res.initialPlan.fallbackAllowed).toBe(false);
    expect(res.activeProposalId).toBeNull();
    expect(res.warnings).toEqual([
      { code: 'INITIAL_SCHEDULE_PARTIAL', message: 'partial' },
    ]);
  });
});
