import { IcelandSelfDriveCreateService } from './iceland-self-drive-create.service';
import { IcelandSelfDriveRouteSkeletonService } from './iceland-self-drive-route-skeleton.service';
import type { CreateIcelandSelfDriveTripDto } from '../dto/create-iceland-self-drive-trip.dto';

describe('IcelandSelfDriveCreateService', () => {
  const dto: CreateIcelandSelfDriveTripDto = {
    destinationCode: 'IS',
    productLine: 'iceland_self_drive',
    dateRange: { startDate: '2027-02-10', endDate: '2027-02-18' },
    travelerCount: 2,
    startLocationCode: 'keflavik',
    endLocationCode: 'keflavik',
    endSameAsStart: true,
    vehicleAcquisition: 'rent',
    regionIds: ['south_coast'],
    skipBookings: true,
  };

  function enrichPrisma(prisma: Record<string, unknown>) {
    return {
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(2),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'day-1',
            ItineraryItem: [
              { type: 'ACTIVITY', bookingStatus: null },
              { type: 'ACTIVITY', bookingStatus: null },
              { type: 'ACTIVITY', bookingStatus: null },
            ],
          },
        ]),
      },
      ...prisma,
    };
  }

  function buildService(prismaInput: Record<string, unknown>) {
    const prisma = enrichPrisma(prismaInput);
    const materializer = {
      materializeShell: jest.fn().mockResolvedValue({
        tripId: 'trip-new',
        tripVersion: 1,
        decisionContractVersion: 1,
      }),
    };
    const bookingAnchors = {
      seedAnchors: jest.fn().mockResolvedValue([]),
    };
    const drafts = {
      markConsumed: jest.fn().mockResolvedValue(undefined),
    };
    const bookablePlaces = {
      search: jest.fn().mockResolvedValue({
        items: [{ placeId: 101 }, { placeId: 102 }],
      }),
    };
    const attractionExploreSeed = {
      seedFromIcelandSelfDriveRegions: jest.fn().mockResolvedValue(2),
      seedFromDestinationDefaults: jest.fn().mockResolvedValue(8),
    };
    const planningOrchestrator = {
      createProposal: jest.fn().mockResolvedValue({
        proposalId: 'prop-1',
        changes: [{ operation: 'ADD' }],
        validation: { status: 'PASS', warnings: [], conflicts: [] },
      }),
      createProposalFromChanges: jest.fn().mockResolvedValue({
        proposalId: 'prop-coverage',
        changes: [{ operation: 'ADD' }, { operation: 'ADD' }],
        validation: { status: 'PASS', warnings: [], conflicts: [] },
      }),
      applyProposal: jest.fn().mockResolvedValue({ status: 'APPLIED' }),
    };
    const initialPlanArrange = {
      buildInitialArrangeChanges: jest.fn().mockResolvedValue({
        changes: [
          {
            operation: 'ADD',
            candidateId: 'c1',
            dayIndex: 1,
            startTime: '09:00',
            endTime: '11:00',
            removeFromCandidates: true,
          },
          {
            operation: 'ADD',
            candidateId: 'c2',
            dayIndex: 2,
            startTime: '09:00',
            endTime: '11:00',
            removeFromCandidates: true,
          },
        ],
        authority: 'coverage',
        emptyDayCountEstimate: 7,
        assignedDayCount: 2,
        activityCount: 2,
      }),
    };
    const regionPacks = {
      seedFromPacks: jest.fn().mockResolvedValue({
        seeded: 2,
        coverageDraft: {
          requested: ['south_coast'],
          covered: [],
          excluded: [],
          activePackIds: ['reykjavik_arrival', 'south_coast_west', 'south_coast_east'],
        },
        warnings: [],
      }),
      evaluateRegionCoverage: jest.fn().mockResolvedValue({
        coverage: {
          requested: ['south_coast'],
          covered: [
            {
              regionId: 'south_coast',
              packId: 'south_coast_west',
              scheduledPlaceIds: [381080, 381038],
            },
          ],
          excluded: [],
          activePackIds: ['reykjavik_arrival', 'south_coast_west', 'south_coast_east'],
        },
        warnings: [],
      }),
    };
    const svc = new IcelandSelfDriveCreateService(
      prisma as never,
      materializer as never,
      new IcelandSelfDriveRouteSkeletonService(),
      bookingAnchors as never,
      drafts as never,
      bookablePlaces as never,
      attractionExploreSeed as never,
      planningOrchestrator as never,
      initialPlanArrange as never,
      regionPacks as never,
    );
    return {
      svc,
      prisma,
      materializer,
      bookingAnchors,
      drafts,
      bookablePlaces,
      attractionExploreSeed,
      planningOrchestrator,
      initialPlanArrange,
      regionPacks,
    };
  }

  it('rejects missing Idempotency-Key', async () => {
    const { svc } = buildService({});
    await expect(svc.createTrip('user-1', dto, undefined)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('replays existing trip for same Idempotency-Key without creating another', async () => {
    const existingMeta = {
      tripVersion: 1,
      icelandSelfDrive: {
        productLine: 'iceland_self_drive',
        idempotencyKey: 'idem-abc',
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
          members: {
            hasChildren: false,
            hasElderly: false,
            motionSickness: false,
          },
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
          days: [
            {
              date: '2027-02-10',
              corridorLabel: '南岸',
              overnightHint: '维克 / 南岸',
            },
          ],
        },
        hardAnchors: [],
        warnings: [],
        createdAt: '2027-01-01T00:00:00.000Z',
        initialSchedule: {
          ready: true,
          scheduledItemCount: 3,
          appliedAt: '2027-01-01T00:00:00.000Z',
          lastProposalId: 'prop-1',
        },
        initialPlan: {
          status: 'READY',
          verificationStatus: 'PASS',
          scheduledDayCount: 9,
          scheduledActivityCount: 3,
          scheduledAnchorCount: 0,
          emptyDayCount: 0,
          lastProposalId: 'prop-1',
          fallbackAllowed: false,
          applyReason: 'INITIAL_PLAN_CREATION',
          authorizationSource: 'CREATE_WIZARD_SUBMISSION',
          generatedAt: '2027-01-01T00:00:00.000Z',
          warnings: [],
        },
      },
    };

    const prisma = {
      tripCollaborator: {
        findMany: jest.fn().mockResolvedValue([
          {
            tripId: 'trip-existing',
            Trip: { id: 'trip-existing', status: 'PLANNING', metadata: existingMeta },
          },
        ]),
      },
      explorationScenario: {
        findFirst: jest.fn().mockResolvedValue({ id: 'scn-existing' }),
        create: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, materializer } = buildService(prisma);

    const first = await svc.createTrip('user-1', dto, 'idem-abc');
    const second = await svc.createTrip('user-1', dto, 'idem-abc');

    expect(first.tripId).toBe('trip-existing');
    expect(second.tripId).toBe('trip-existing');
    expect(first.generationStatus).toBe('READY');
    expect(first.scenarioId).toBe('scn-existing');
    expect(first.initialScheduleReady).toBe(true);
    expect(first.scheduledItemCount).toBe(3);
    expect(first.initialPlan?.status).toBe('READY');
    expect(materializer.materializeShell).not.toHaveBeenCalled();
    expect(prisma.explorationScenario.create).not.toHaveBeenCalled();
  });

  it('asyncGeneration returns RUNNING and later marks READY with route_generated', async () => {
    jest.useFakeTimers();
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };

    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        findUnique: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, bookingAnchors, bookablePlaces, attractionExploreSeed, planningOrchestrator, regionPacks } =
      buildService(prisma);
    const res = await svc.createTrip(
      'user-1',
      { ...dto, asyncGeneration: true },
      'idem-async',
    );

    expect(res.generationStatus).toBe('RUNNING');
    expect(bookingAnchors.seedAnchors).not.toHaveBeenCalled();

    await jest.runAllTimersAsync();

    expect(bookingAnchors.seedAnchors).toHaveBeenCalled();
    expect(regionPacks.seedFromPacks).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-new',
        regionIds: ['south_coast'],
        dayCount: 9,
      }),
    );
    expect(bookablePlaces.search).toHaveBeenCalledWith({
      kind: 'activity',
      regionIds: ['south_coast'],
      limit: 27,
    });
    expect(planningOrchestrator.createProposalFromChanges).toHaveBeenCalled();
    expect(planningOrchestrator.createProposal).not.toHaveBeenCalled();
    expect(planningOrchestrator.applyProposal).toHaveBeenCalledWith({
      proposalId: 'prop-coverage',
      userId: 'user-1',
      force: false,
      comment: 'INITIAL_PLAN_CREATION',
    });
    const isd = (metaStore.current as {
      icelandSelfDrive: {
        generationStatus: string;
        lastEvents: { type: string }[];
        initialPlan: {
          status: string;
          scheduledActivityCount: number;
          fallbackAllowed: boolean;
          arrangeAuthority?: string;
          regionCoverage?: { requested: string[]; covered: unknown[] };
        };
      };
    }).icelandSelfDrive;
    expect(isd.generationStatus).toBe('READY');
    expect(isd.lastEvents.some((e) => e.type === 'route_generated')).toBe(true);
    expect(isd.initialPlan.status).toBe('READY');
    expect(isd.initialPlan.scheduledActivityCount).toBe(3);
    expect(isd.initialPlan.fallbackAllowed).toBe(false);
    expect(isd.initialPlan.arrangeAuthority).toBe('coverage');
    expect(isd.initialPlan.regionCoverage?.requested).toEqual(['south_coast']);

    jest.useRealTimers();
  });

  it('seeds region attraction candidates and auto-applies schedule on sync create', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, bookablePlaces, attractionExploreSeed, planningOrchestrator, regionPacks } =
      buildService(prisma);
    const res = await svc.createTrip('user-1', dto, 'idem-sync-seed');

    expect(regionPacks.seedFromPacks).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-new',
        regionIds: ['south_coast'],
        dayCount: 9,
      }),
    );
    expect(bookablePlaces.search).toHaveBeenCalledWith({
      kind: 'activity',
      regionIds: ['south_coast'],
      limit: 27,
    });
    expect(attractionExploreSeed.seedFromIcelandSelfDriveRegions).not.toHaveBeenCalled();
    expect(attractionExploreSeed.seedFromDestinationDefaults).not.toHaveBeenCalled();
    expect(planningOrchestrator.createProposalFromChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-new',
        userId: 'user-1',
        intent: 'AUTO_ARRANGE',
      }),
    );
    expect(planningOrchestrator.createProposal).not.toHaveBeenCalled();
    expect(planningOrchestrator.applyProposal).toHaveBeenCalled();
    expect(res.initialScheduleReady).toBe(true);
    expect(res.scheduledItemCount).toBe(3);
    expect(res.initialPlan?.status).toBe('READY');
    expect(res.initialPlan?.fallbackAllowed).toBe(false);
    expect(res.initialPlan?.arrangeAuthority).toBe('coverage');
    expect(res.initialPlan?.regionCoverage?.covered?.[0]?.regionId).toBe('south_coast');
  });

  it('falls back to greedy AUTO_ARRANGE when coverage returns null', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, planningOrchestrator, initialPlanArrange } = buildService(prisma);
    initialPlanArrange.buildInitialArrangeChanges.mockResolvedValue(null);

    const res = await svc.createTrip('user-1', dto, 'idem-greedy-fallback');

    expect(planningOrchestrator.createProposal).toHaveBeenCalled();
    expect(planningOrchestrator.createProposalFromChanges).not.toHaveBeenCalled();
    expect(planningOrchestrator.applyProposal).toHaveBeenCalled();
    expect(res.initialPlan?.arrangeAuthority).toBe('greedy');
    expect(res.initialPlan?.status).toBe('READY');
  });

  it('falls back to destination defaults when only ring_road', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, bookablePlaces, attractionExploreSeed, regionPacks } = buildService(prisma);
    regionPacks.seedFromPacks.mockResolvedValue({
      seeded: 0,
      coverageDraft: {
        requested: ['ring_road'],
        covered: [],
        excluded: [],
        activePackIds: ['reykjavik_arrival'],
      },
      warnings: [],
    });
    await svc.createTrip(
      'user-1',
      { ...dto, regionIds: ['ring_road'] },
      'idem-ring',
    );

    expect(bookablePlaces.search).not.toHaveBeenCalled();
    expect(attractionExploreSeed.seedFromDestinationDefaults).toHaveBeenCalledWith('trip-new');
    expect(attractionExploreSeed.seedFromIcelandSelfDriveRegions).not.toHaveBeenCalled();
  });

  it('falls back to destination defaults when region catalog is empty', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc, bookablePlaces, attractionExploreSeed, regionPacks } = buildService(prisma);
    bookablePlaces.search.mockResolvedValue({ items: [] });
    regionPacks.seedFromPacks.mockResolvedValue({
      seeded: 0,
      coverageDraft: {
        requested: ['south_coast'],
        covered: [],
        excluded: [],
        activePackIds: ['reykjavik_arrival', 'south_coast_west'],
      },
      warnings: [],
    });

    await svc.createTrip('user-1', dto, 'idem-empty-catalog');

    expect(attractionExploreSeed.seedFromDestinationDefaults).toHaveBeenCalledWith('trip-new');
    expect(attractionExploreSeed.seedFromIcelandSelfDriveRegions).not.toHaveBeenCalled();
  });

  it('stays trip READY with initialPlan FAILED when apply fails', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([{ id: 'day-1', ItineraryItem: [] }]),
      },
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(2),
      },
    };

    const { svc, planningOrchestrator } = buildService(prisma);
    planningOrchestrator.applyProposal.mockRejectedValue(new Error('apply boom'));

    const res = await svc.createTrip('user-1', dto, 'idem-apply-fail');

    expect(res.generationStatus).toBe('READY');
    expect(res.initialPlan?.status).toBe('FAILED');
    expect(res.initialPlan?.fallbackAllowed).toBe(true);
    expect(res.initialScheduleReady).toBe(false);
    expect(res.warnings.some((w) => w.code === 'INITIAL_SCHEDULE_EMPTY')).toBe(true);
  });

  it('skips apply on BLOCK and sets PLAN_VERIFICATION_BLOCKED', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([{ id: 'day-1', ItineraryItem: [] }]),
      },
    };

    const { svc, planningOrchestrator } = buildService(prisma);
    planningOrchestrator.createProposalFromChanges.mockResolvedValue({
      proposalId: 'prop-block',
      changes: [{ operation: 'ADD' }],
      validation: { status: 'BLOCK', warnings: [], conflicts: [{ kind: 'duplicate_item' }] },
    });

    const res = await svc.createTrip('user-1', dto, 'idem-block');

    expect(planningOrchestrator.applyProposal).not.toHaveBeenCalled();
    expect(res.generationStatus).toBe('READY');
    expect(res.initialPlan?.status).toBe('FAILED');
    expect(res.initialPlan?.verificationStatus).toBe('BLOCK');
    expect(res.initialPlan?.fallbackAllowed).toBe(true);
    expect(res.warnings.some((w) => w.code === 'PLAN_VERIFICATION_BLOCKED')).toBe(true);
  });

  it('marks PARTIAL when only booking anchors exist', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'day-1',
            ItineraryItem: [{ type: 'REST', bookingStatus: 'CONFIRMED' }],
          },
        ]),
      },
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const { svc, planningOrchestrator, initialPlanArrange } = buildService(prisma);
    initialPlanArrange.buildInitialArrangeChanges.mockResolvedValue(null);
    planningOrchestrator.createProposal.mockRejectedValue({
      getResponse: () => ({ code: 'NO_CANDIDATES' }),
    });

    const res = await svc.createTrip('user-1', dto, 'idem-anchors-only');

    expect(res.generationStatus).toBe('READY');
    expect(res.initialPlan?.status).toBe('PARTIAL');
    expect(res.initialPlan?.scheduledAnchorCount).toBe(1);
    expect(res.initialPlan?.scheduledActivityCount).toBe(0);
    expect(res.initialPlan?.fallbackAllowed).toBe(false);
    expect(res.warnings.some((w) => w.code === 'INITIAL_SCHEDULE_PARTIAL')).toBe(true);
  });

  it('emits ATTRACTION_CANDIDATES_EMPTY when no candidates', async () => {
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(0),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([{ id: 'day-1', ItineraryItem: [] }]),
      },
    };

    const { svc, planningOrchestrator, initialPlanArrange } = buildService(prisma);
    initialPlanArrange.buildInitialArrangeChanges.mockResolvedValue(null);
    planningOrchestrator.createProposal.mockRejectedValue({
      getResponse: () => ({ code: 'NO_CANDIDATES' }),
    });

    const res = await svc.createTrip('user-1', dto, 'idem-no-cand');

    expect(res.generationStatus).toBe('READY');
    expect(res.initialPlan?.status).toBe('FAILED');
    expect(res.initialPlan?.fallbackAllowed).toBe(true);
    expect(res.warnings.some((w) => w.code === 'ATTRACTION_CANDIDATES_EMPTY')).toBe(true);
    expect(res.warnings.some((w) => w.code === 'INITIAL_SCHEDULE_EMPTY')).toBe(true);
  });

  it('async create exposes GENERATING initialPlan before background completes', async () => {
    jest.useFakeTimers();
    const metaStore: { current: Record<string, unknown> } = {
      current: { tripVersion: 1 },
    };
    const prisma = {
      tripCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      explorationScenario: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        findUnique: jest.fn().mockImplementation(async () => ({
          metadata: metaStore.current,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          metaStore.current = data.metadata;
          return {};
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { svc } = buildService(prisma);
    const res = await svc.createTrip(
      'user-1',
      { ...dto, asyncGeneration: true },
      'idem-gen-status',
    );

    expect(res.generationStatus).toBe('RUNNING');
    expect(res.initialPlan?.status).toBe('GENERATING');
    expect(res.initialPlan?.fallbackAllowed).toBe(false);

    await jest.runAllTimersAsync();
    jest.useRealTimers();
  });
});
