/**
 * 多模态交付 UI 契约（tripnara.delivery_artifacts@v1）
 *
 * 规划成功后默认附带日历/地图/分享等可执行链接，避免用户只能复制 Markdown。
 */

import type { Itinerary, ItineraryItem } from '../interfaces/trip-plan.interface';

export const DELIVERY_ARTIFACTS_SCHEMA = 'tripnara.delivery_artifacts@v1' as const;

export interface DeliveryArtifactLink {
  kind: 'calendar' | 'map' | 'share' | 'pdf' | 'text_export';
  label_zh: string;
  href: string;
  api_action?: {
    method: 'GET' | 'POST';
    path: string;
    body_keys?: string[];
  };
}

export interface DeliveryArtifactsUi {
  schema: typeof DELIVERY_ARTIFACTS_SCHEMA;
  trip_id?: string;
  links: DeliveryArtifactLink[];
  map_polyline_url?: string;
  computed_at: string;
}

function extractCoordinates(itinerary: Itinerary): Array<{ lat: number; lng: number; name?: string }> {
  const coords: Array<{ lat: number; lng: number; name?: string }> = [];
  for (const day of itinerary.days ?? []) {
    for (const item of day.items ?? []) {
      const c =
        item.location_ref?.coordinates ??
        (item as { location?: { lat: number; lng: number } }).location;
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
        coords.push({
          lat: c.lat,
          lng: c.lng,
          name: item.location_ref?.name,
        });
      }
    }
  }
  return coords;
}

/** 去重相邻重复坐标，保留顺序 */
function dedupeAdjacentCoords(
  coords: Array<{ lat: number; lng: number; name?: string }>,
): Array<{ lat: number; lng: number; name?: string }> {
  const out: Array<{ lat: number; lng: number; name?: string }> = [];
  for (const c of coords) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.lat - c.lat) < 1e-5 && Math.abs(prev.lng - c.lng) < 1e-5) {
      continue;
    }
    out.push(c);
  }
  return out;
}

export function buildGoogleMapsDirectionsUrl(
  coords: Array<{ lat: number; lng: number }>,
): string | undefined {
  if (coords.length < 2) return undefined;
  const origin = `${coords[0].lat},${coords[0].lng}`;
  const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`;
  const waypoints =
    coords.length > 2
      ? coords
          .slice(1, -1)
          .map((c) => `${c.lat},${c.lng}`)
          .join('|')
      : undefined;
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildDeliveryArtifactsUi(input: {
  itinerary?: Itinerary | null;
  tripId?: string | null;
  userId?: string | null;
  /** 仅 OK 且有行程时输出 */
  include?: boolean;
}): DeliveryArtifactsUi | undefined {
  if (input.include === false) return undefined;
  const itinerary = input.itinerary;
  if (!itinerary?.days?.length) return undefined;

  const tripId = input.tripId?.trim() || undefined;
  const links: DeliveryArtifactLink[] = [];
  const coords = dedupeAdjacentCoords(extractCoordinates(itinerary));
  const mapUrl = buildGoogleMapsDirectionsUrl(coords);

  if (mapUrl) {
    links.push({
      kind: 'map',
      label_zh: '在 Google 地图中查看动线',
      href: mapUrl,
    });
  }

  if (tripId) {
    links.push({
      kind: 'share',
      label_zh: '打开行程工作台',
      href: `/dashboard/trips/${tripId}`,
    });

    links.push({
      kind: 'calendar',
      label_zh: '同步到 Google 日历',
      href: `/dashboard/trips/${tripId}?action=sync_calendar`,
      api_action: {
        method: 'POST',
        path: `/google-calendar/trips/${tripId}/sync`,
        body_keys: input.userId ? ['userId'] : undefined,
      },
    });

    links.push({
      kind: 'pdf',
      label_zh: '导出行程 PDF',
      href: `/dashboard/trips/${tripId}?action=export_pdf`,
    });
  }

  links.push({
    kind: 'text_export',
    label_zh: '复制文字版行程',
    href: '#copy-itinerary-text',
  });

  if (!links.length) return undefined;

  return {
    schema: DELIVERY_ARTIFACTS_SCHEMA,
    ...(tripId ? { trip_id: tripId } : {}),
    links,
    ...(mapUrl ? { map_polyline_url: mapUrl } : {}),
    computed_at: new Date().toISOString(),
  };
}
