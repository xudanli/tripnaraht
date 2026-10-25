/**
 * Graph node type from canonical id shape (any country). Identity.entityType wins at call site.
 */

const CPRE_PLACE_RE = /^[a-z]{2}\.[a-z0-9_.]+$/i;

export function inferGraphNodeType(id: string): string {
  const t = id.trim();
  if (!t) return 'Entity';
  if (CPRE_PLACE_RE.test(t) || t.startsWith('place:') || t.startsWith('spatial-poi:')) {
    return 'Place';
  }
  if (t.startsWith('segment:')) return 'RouteSegment';
  if (t.startsWith('road:')) return 'Road';
  if (t.startsWith('vehicle:')) return 'Vehicle';
  if (t.startsWith('weather-region:') || t.startsWith('wx_')) return 'WeatherRegion';
  if (t.startsWith('risk:')) return 'Risk';
  if (t.startsWith('activity:')) return 'Activity';
  if (t.startsWith('hazard:')) return 'NaturalHazard';
  return 'Entity';
}

export function iconForGraphNodeType(t: string): string | undefined {
  switch (t) {
    case 'Place':
      return 'place';
    case 'RouteSegment':
    case 'Road':
      return 'route';
    case 'Risk':
    case 'NaturalHazard':
      return 'warning';
    case 'Vehicle':
      return 'directions_car';
    default:
      return undefined;
  }
}
