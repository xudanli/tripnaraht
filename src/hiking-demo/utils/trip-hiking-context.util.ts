export type TripHikingContext = {
  routeDirectionId?: number;
  routeDirectionName?: string;
  tags: string[];
  activities: string[];
  countryCodes: string[];
};

const HIKING_TAG_MARKERS = ['徒步', 'hiking', 'trek', 'trail', 'TREKKING'];

export function tripHasHikingActivity(ctx: TripHikingContext): boolean {
  const haystack = [
    ...ctx.tags,
    ...ctx.activities,
    ctx.routeDirectionName ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return HIKING_TAG_MARKERS.some(
    (m) => haystack.includes(m.toLowerCase()) || ctx.tags.includes(m),
  );
}

export function extractTripHikingContext(trip: {
  metadata?: unknown;
  destination?: string | null;
  TripDay?: Array<{
    ItineraryItem?: Array<{ type?: string | null; metadata?: unknown }>;
  }>;
}): TripHikingContext {
  const meta =
    trip.metadata && typeof trip.metadata === 'object'
      ? (trip.metadata as Record<string, unknown>)
      : {};
  const tags = Array.isArray(meta.tags)
    ? (meta.tags as string[])
    : [];
  const routeDirectionName =
    typeof meta.routeDirectionName === 'string'
      ? meta.routeDirectionName
      : undefined;
  const routeDirectionId =
    typeof meta.routeDirectionId === 'number'
      ? meta.routeDirectionId
      : typeof meta.routeDirectionId === 'string' &&
          /^\d+$/.test(meta.routeDirectionId)
        ? parseInt(meta.routeDirectionId, 10)
        : undefined;

  const activities: string[] = [];
  for (const day of trip.TripDay ?? []) {
    for (const item of day.ItineraryItem ?? []) {
      if (item.type) activities.push(item.type);
      const im =
        item.metadata && typeof item.metadata === 'object'
          ? (item.metadata as Record<string, unknown>)
          : {};
      if (typeof im.activity === 'string') activities.push(im.activity);
      if (Array.isArray(im.tags)) activities.push(...(im.tags as string[]));
    }
  }

  const dest = trip.destination ?? '';
  const countryCodes = dest.length === 2 ? [dest.toUpperCase()] : [];

  return { routeDirectionId, routeDirectionName, tags, activities, countryCodes };
}
