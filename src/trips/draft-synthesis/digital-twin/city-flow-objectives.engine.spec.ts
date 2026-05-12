import { createEmptyCityDigitalTwin } from './digital-twin-state.engine';
import { scoreCityFlowState } from './city-flow-objectives.engine';

describe('scoreCityFlowState', () => {
  it('returns bounded score', () => {
    const twin = createEmptyCityDigitalTwin('TYO');
    twin.mobilityLayer.congestion['a|b'] = 0.4;
    twin.poiLayer.liveQueue[1] = 0.5;
    twin.demandLayer.userFlows = 10;
    const s = scoreCityFlowState(twin);
    expect(s.score).toBeGreaterThanOrEqual(-1);
    expect(s.score).toBeLessThanOrEqual(1);
  });
});
