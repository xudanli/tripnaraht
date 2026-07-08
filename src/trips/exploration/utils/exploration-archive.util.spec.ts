import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../constants/exploration-status.constants';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
  readExplorationArchiveFromTripMetadata,
  readRankedPrinciplesFromTripMetadata,
} from './exploration-archive.util';

describe('exploration-archive.util', () => {
  it('buildExplorationArchive maps SELECTED and ARCHIVED variants', () => {
    const archive = buildExplorationArchive({
      variants: [
        { routeId: 'route-a', status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
        { routeId: 'route-b', status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
        { routeId: 'route-c', status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      ],
      researchProtocolId: 'iceland-discovery-v1',
      materializedAt: '2026-07-05T12:00:00.000Z',
      principles: ['PACE', 'SAFETY'],
    });

    expect(archive.selectedRouteId).toBe('route-b');
    expect(archive.rejectedRouteIds).toEqual(['route-a']);
    expect(archive.principles).toEqual(['PACE', 'SAFETY']);
  });

  it('mergeTravelContextExplorationArchive nests under travelContext', () => {
    const merged = mergeTravelContextExplorationArchive(
      { source: 'exploration', tripVersion: 1 },
      {
        contextId: 'scenario-1',
        explorationArchive: {
          rejectedRouteIds: ['route-a'],
          selectedRouteId: 'route-b',
          researchProtocolId: null,
          materializedAt: '2026-07-05T12:00:00.000Z',
        },
      },
    );

    expect(merged.travelContextId).toBe('scenario-1');
    expect(readExplorationArchiveFromTripMetadata(merged)?.selectedRouteId).toBe('route-b');
  });

  it('readRankedPrinciplesFromTripMetadata reads travelDecisionContract', () => {
    expect(
      readRankedPrinciplesFromTripMetadata({
        travelDecisionContract: {
          objectives: { rankedPrinciples: ['SAFETY', 'PACE'] },
        },
      }),
    ).toEqual(['SAFETY', 'PACE']);
  });
});
