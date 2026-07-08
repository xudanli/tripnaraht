import {
  buildRouteMapLayers,
  buildRouteMapPreview,
  densifyRouteLineAnchors,
} from '../utils/route-map-geometry.util';

describe('route-map-geometry.util', () => {
  it('densifies sparse F-road anchors', () => {
    const anchors: Array<[number, number]> = [
      [-16.7, 65.6],
      [-17.5, 65.0],
      [-18.6, 64.35],
    ];
    const dense = densifyRouteLineAnchors(anchors, 5);
    expect(dense.length).toBeGreaterThan(anchors.length);
  });

  it('builds main + fRoad layers for map rendering', () => {
    const layers = buildRouteMapLayers({
      mainLine: [[-21.9, 64.1], [-19.0, 63.4]],
      fRoadLine: [[-16.7, 65.6], [-16.7, 65.0]],
    });
    expect(layers).toHaveLength(2);
    expect(layers[1]?.id).toBe('fRoad');
    expect(layers[1]?.lineStyle).toBe('dashed');
    expect(layers[1]?.requires4wd).toBe(true);
  });

  it('buildRouteMapPreview densifies fRoadLine and attaches layers', () => {
    const preview = buildRouteMapPreview({
      mainLine: [[-21.9, 64.1], [-19.0, 63.4]],
      fRoadLine: [[-16.7, 65.6], [-17.5, 65.0], [-18.6, 64.35]],
    });
    expect(preview.fRoadLine!.length).toBeGreaterThan(3);
    expect(preview.layers).toHaveLength(2);
    expect(preview.layers![1]?.id).toBe('fRoad');
  });
});
