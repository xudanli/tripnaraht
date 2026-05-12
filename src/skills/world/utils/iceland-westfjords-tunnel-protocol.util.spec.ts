import { evaluateWestfjordsTunnelProtocol } from './iceland-westfjords-tunnel-protocol.util';

describe('evaluateWestfjordsTunnelProtocol', () => {
  it('is silent when route has no Westfjords tunnel mesh presets', () => {
    const r = evaluateWestfjordsTunnelProtocol([{ from_region: 'reykjavik', to_region: 'vik' }]);
    expect(r.triggered).toBe(false);
    expect(r.recommendedAdjustments).toEqual([]);
    expect(r.affectedSegments).toEqual([]);
  });

  it('fires for holmavik–isafjordur and injects adjustment + notes + affected segment labels', () => {
    const r = evaluateWestfjordsTunnelProtocol([{ from_region: 'holmavik', to_region: 'isafjordur', distanceKm: 170 }]);
    expect(r.triggered).toBe(true);
    expect(r.recommendedAdjustments).toEqual(['REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL']);
    expect(r.affectedSegments).toEqual(['holmavik-isafjordur']);
    expect(r.drivingNotes.some((n) => /Vestfjarðagöng|single-lane/i.test(n))).toBe(true);
    expect(r.drivingNotes.some((n) => /M-stæði/i.test(n))).toBe(true);
  });
});
