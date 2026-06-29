import {
  parseJourneyMapInclude,
  JourneyMapService,
} from './journey-map.service';

describe('parseJourneyMapInclude', () => {
  it('defaults to shell when empty', () => {
    const set = parseJourneyMapInclude(undefined);
    expect(set.has('shell')).toBe(true);
    expect(set.has('inspector')).toBe(false);
  });

  it('parses inspector and ensures shell for required fields', () => {
    const set = parseJourneyMapInclude('inspector');
    expect(set.has('shell')).toBe(true);
    expect(set.has('inspector')).toBe(true);
  });

  it('parses shell,inspector', () => {
    const set = parseJourneyMapInclude('shell,inspector');
    expect(set.has('shell')).toBe(true);
    expect(set.has('inspector')).toBe(true);
  });
});

describe('JourneyMapService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const itineraryItems = { findByTrip: jest.fn() };
  const coverageMap = {
    getCoverageMap: jest.fn(),
    getReadinessScore: jest.fn(),
  };
  const tripExtended = { getCollaborators: jest.fn() };
  const decisionChecker = { getDecisionChecker: jest.fn() };
  const splitPlans = { projectDaySplits: jest.fn() };
  const routeGeometry = { resolveGeometry: jest.fn() };
  const decisionItems = { listForTrip: jest.fn().mockResolvedValue([]) };

  let service: JourneyMapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JourneyMapService(
      prisma as any,
      itineraryItems as any,
      coverageMap as any,
      tripExtended as any,
      decisionChecker as any,
      splitPlans as any,
      routeGeometry as any,
      decisionItems as any,
    );

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      name: 'Iceland',
      destination: 'IS',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
      metadata: { dayThemes: { 1: 'Golden Circle' }, userId: 'owner-1' },
      pacingConfig: {
        travelers: [
          { type: 'ADULT' },
          { type: 'ELDERLY' },
        ],
      },
      budgetConfig: null,
      TripDay: [{ id: 'day-1', date: new Date('2026-06-20') }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'owner-1', displayName: 'Owner' });
    coverageMap.getCoverageMap.mockResolvedValue({
      tripId: 'trip-1',
      bounds: {},
      center: { lat: 64, lng: -21 },
      zoom: 6,
      pois: [
        {
          id: 'p1',
          day: 1,
          order: 1,
          name: 'Reykjavik',
          type: 'CITY',
          coordinates: { lat: 64.1, lng: -21.9 },
          coverageStatus: 'covered',
          evidenceCount: 0,
        },
        {
          id: 'p2',
          day: 1,
          order: 2,
          name: 'Vik',
          type: 'CITY',
          coordinates: { lat: 63.4, lng: -19.0 },
          coverageStatus: 'covered',
          evidenceCount: 0,
        },
      ],
      segments: [{ polyline: 'abc', day: 1, distance: 180 }],
      gaps: [{ id: 'gap-1' }],
      deduplicatedWarnings: [{ id: 'warn-1' }],
      summary: {},
      calculatedAt: '2026-06-29T12:00:00.000Z',
    });
    itineraryItems.findByTrip.mockResolvedValue([
      { id: 'item-1', type: 'ACTIVITY' },
      { id: 'item-2', type: 'TRANSIT' },
    ]);
    tripExtended.getCollaborators.mockResolvedValue([
      { userId: 'u2', displayName: 'Bob' },
    ]);
    coverageMap.getReadinessScore.mockResolvedValue({
      score: { overall: 72.4 },
      risks: [{ id: 'risk-1' }],
      findings: [{ id: 'finding-1' }],
    });
    decisionChecker.getDecisionChecker.mockResolvedValue({
      evidence: { items: [] },
      impact: { summary: {}, constraints: [], cascade: [] },
    });
    splitPlans.projectDaySplits.mockResolvedValue(undefined);
    routeGeometry.resolveGeometry.mockResolvedValue({
      polyline: 'encoded-line',
      geometrySource: 'straight_line',
    });
  });

  it('returns shell payload without inspector by default', async () => {
    const data = await service.getJourneyMap('trip-1', {});
    expect(data.feasibilityScore).toBe(72);
    expect(data.travelerCount).toBe(2);
    expect(data.trip.updatedAt).toBe('2026-06-29T00:00:00.000Z');
    expect(data.trip.TripDay[0]?.theme).toBe('Golden Circle');
    expect(data.members).toHaveLength(2);
    expect(data.members?.[0]?.groupId).toBe('young');
    expect(data.members?.[1]?.groupId).toBe('elderly');
    expect(data.memberGroups).toEqual([
      { id: 'young', label: '年轻人组', count: 1 },
      { id: 'elderly', label: '长者组', count: 1 },
      { id: 'children', label: '儿童组', count: 0 },
    ]);
    expect(data.daySummaries).toEqual([
      { day: 1, routeLabel: 'Reykjavik → Vik' },
    ]);
    expect(data.dataFeeds).toHaveLength(4);
    expect(data.stats).toMatchObject({
      totalDays: 1,
      totalDistanceKm: 180,
      activityCount: 1,
      diversionCount: 0,
    });
    expect(data.inspector).toBeUndefined();
    expect(decisionChecker.getDecisionChecker).not.toHaveBeenCalled();
  });

  it('includes activityContexts when inspector requested', async () => {
    const result = await service.getJourneyMap('trip-1', { include: 'inspector' });
    expect(result.inspector?.activityContexts).toBeDefined();
    expect(Array.isArray(result.inspector?.activityContexts)).toBe(true);
  });

  it('strips gaps when fields=minimal', async () => {
    coverageMap.getCoverageMap.mockResolvedValue({
      tripId: 'trip-1',
      bounds: {},
      center: { lat: 64, lng: -21 },
      zoom: 6,
      pois: [],
      segments: [{ polyline: 'abc' }],
      gaps: [],
      summary: { totalGaps: 0 },
      calculatedAt: '2026-06-29T12:00:00.000Z',
    });

    const data = await service.getJourneyMap('trip-1', { fields: 'minimal' });

    expect(coverageMap.getCoverageMap).toHaveBeenCalledWith('trip-1', {
      includeGaps: false,
      resolveRouteGeometry: false,
    });
    expect(coverageMap.getReadinessScore).toHaveBeenCalledWith('trip-1');
    expect(coverageMap.getReadinessScore).not.toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ coverageData: expect.anything() }),
    );
    expect(data.coverage.gaps).toEqual([]);
    expect(data.coverage.deduplicatedWarnings).toBeUndefined();
  });

  it('reuses coverage for readiness score when fields=full', async () => {
    await service.getJourneyMap('trip-1', { fields: 'full' });

    expect(coverageMap.getCoverageMap).toHaveBeenCalledWith('trip-1', {
      includeGaps: true,
      resolveRouteGeometry: true,
    });
    expect(coverageMap.getReadinessScore).toHaveBeenCalledWith('trip-1', {
      coverageData: expect.objectContaining({ tripId: 'trip-1' }),
    });
  });

  it('includes inspector when requested', async () => {
    const data = await service.getJourneyMap('trip-1', { include: 'shell,inspector' });

    expect(data.inspector?.evidence).toEqual({ items: [] });
    expect(data.inspector?.scoreRisks).toHaveLength(1);
    expect(decisionChecker.getDecisionChecker).toHaveBeenCalledWith('trip-1');
  });
});
