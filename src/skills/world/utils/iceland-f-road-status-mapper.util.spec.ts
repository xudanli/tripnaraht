import { mapRoadStatusToFRoadStatus } from './iceland-f-road-status-mapper.util';
import type { RoadStatus } from '../services/road-status-realtime.service';

function base(rs: Partial<RoadStatus>): RoadStatus {
  return {
    roadId: 'F208',
    currentStatus: 'open',
    lastVerifiedAt: new Date(),
    hazards: [],
    ...rs,
  };
}

describe('mapRoadStatusToFRoadStatus', () => {
  it('maps closed to closed', () => {
    const o = mapRoadStatusToFRoadStatus(base({ currentStatus: 'closed', roadId: 'F208' }));
    expect(o.status).toBe('closed');
    expect(o.requires4x4).toBe(false);
  });

  it('marks known ford roads', () => {
    const o = mapRoadStatusToFRoadStatus(base({ roadId: 'F249', currentStatus: 'open' }));
    expect(o.riverCrossing).toBe(true);
    expect(o.camperRestricted).toBe(true);
  });

  it('maps limited to requires4x4', () => {
    const o = mapRoadStatusToFRoadStatus(base({ currentStatus: 'limited', roadId: 'F35' }));
    expect(o.requires4x4).toBe(true);
  });

  it('maps unknown status to impassable with reduced confidence', () => {
    const o = mapRoadStatusToFRoadStatus(
      base({ currentStatus: 'unknown', roadId: 'F910', confidence: 0.9 }),
    );
    expect(o.status).toBe('impassable');
    expect(o.confidence).toBeLessThanOrEqual(0.45);
  });
});
