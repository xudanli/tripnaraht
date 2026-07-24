import {
  readCanonicalPoiIdFromMetadata,
  resolveCanonicalPoiIdSync,
} from '../../canonical-poi-resolution/utils/resolve-poi-id-sync.util';

export function resolvePoiAccessSlug(input: {
  placeId?: string | number;
  name?: string;
  metadata?: Record<string, unknown>;
  countryCode?: string;
}): string | undefined {
  const fromMeta = readCanonicalPoiIdFromMetadata(input.metadata);
  if (fromMeta) return fromMeta;

  const hay = `${input.name ?? ''}`.trim();
  if (!hay) return undefined;

  const resolved = resolveCanonicalPoiIdSync({
    name: hay,
    countryCode: input.countryCode ?? 'IS',
  });
  if (resolved.status === 'MATCHED' && resolved.poiId) {
    return resolved.poiId;
  }
  return undefined;
}

export function resolvePoiAccessSlugFromPlaceMetadata(
  metadata: unknown,
  name?: string,
  countryCode = 'IS',
): string | undefined {
  const meta =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : undefined;
  return resolvePoiAccessSlug({ name, metadata: meta, countryCode });
}
