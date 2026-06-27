import { ICELAND_POI_SLUG_RESOLVERS } from '../fixtures/iceland-poi-registry';

export function resolvePoiAccessSlug(input: {
  placeId?: string | number;
  name?: string;
  metadata?: Record<string, unknown>;
}): string | undefined {
  const metaSlug =
    typeof input.metadata?.poi_access_slug === 'string'
      ? input.metadata.poi_access_slug
      : undefined;
  if (metaSlug) return metaSlug;

  const hay = `${input.name ?? ''}`;
  for (const { slug, patterns } of ICELAND_POI_SLUG_RESOLVERS) {
    if (patterns.some((p) => p.test(hay))) return slug;
  }
  return undefined;
}

export function resolvePoiAccessSlugFromPlaceMetadata(
  metadata: unknown,
  name?: string,
): string | undefined {
  const meta =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : undefined;
  return resolvePoiAccessSlug({ name, metadata: meta });
}
