import {
  ExplorationPoiIssueBridgeService,
  buildCprePoiIssueId,
  isUnresolvedExplorationPoi,
} from './exploration-poi-issue-bridge.service';

describe('ExplorationPoiIssueBridgeService', () => {
  const prisma = {
    explorationScenario: { findFirst: jest.fn() },
    explorationRouteVariant: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const scenarios = {
    parseInitialInput: jest.fn((input: unknown) => input),
  };
  const poiResolution = {
    resolveForRouteDetail: jest.fn(),
  };
  const routeDetails = {
    parseStoredRouteDetail: jest.fn(),
  };

  const bridge = new ExplorationPoiIssueBridgeService(
    prisma as any,
    scenarios as any,
    poiResolution as any,
    routeDetails as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isUnresolvedExplorationPoi detects NEEDS_CONFIRMATION', () => {
    expect(
      isUnresolvedExplorationPoi({
        name: '天空之湖',
        resolved: false,
        status: 'NEEDS_CONFIRMATION',
      }),
    ).toBe(true);
    expect(
      isUnresolvedExplorationPoi({
        name: '蓝湖',
        resolved: true,
        poiId: 'is.blue_lagoon',
        status: 'MATCHED',
      }),
    ).toBe(false);
  });

  it('projectUnresolvedPois maps unresolved refs to consumer issues', async () => {
    prisma.explorationScenario.findFirst.mockResolvedValue({
      id: 'scn_1',
      initialInput: { destinationCodes: ['IS'] },
    });
    prisma.explorationRouteVariant.findFirst.mockResolvedValue({
      narrative: '含天空之湖',
      routeDetail: { days: [], map: { mainLine: [[0, 0], [1, 1]] } },
    });
    routeDetails.parseStoredRouteDetail.mockReturnValue({
      days: [],
      map: { mainLine: [[0, 0], [1, 1]] },
    });
    poiResolution.resolveForRouteDetail.mockResolvedValue([
      {
        name: '天空之湖',
        resolved: false,
        status: 'NEEDS_CONFIRMATION',
        canonicalName: 'Sky Lagoon',
      },
    ]);

    const issues = await bridge.projectUnresolvedPois('trip_1');

    expect(issues).toHaveLength(1);
    expect(issues[0].issueId).toBe(buildCprePoiIssueId('天空之湖'));
    expect(issues[0].severity).toBe('VERIFY');
    expect(issues[0].cprePoi?.mention).toBe('天空之湖');
    expect(issues[0].decisionRequired).toBe(true);
  });
});
