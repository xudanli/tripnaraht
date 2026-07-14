/**
 * Place 写入护栏：阻止把 tour/product 语义写进 Location 库。
 */

import {
  getIcelandCanonicalMigration,
  isCanonicalTypeBlockedForNewPlaces,
} from '../../travel-product-catalog/data/iceland-poi-to-product-migration';

export class PlaceProductCanonicalBlockedError extends Error {
  readonly code = 'PLACE_PRODUCT_CANONICAL_BLOCKED';
  readonly canonicalType: string;
  readonly targetHint?: string;

  constructor(canonicalType: string, message: string, targetHint?: string) {
    super(message);
    this.name = 'PlaceProductCanonicalBlockedError';
    this.canonicalType = canonicalType;
    this.targetHint = targetHint;
  }
}

export function extractCanonicalTypeFromMetadata(
  metadata: unknown,
): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>).canonicalType;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * 若 metadata.canonicalType 属于 MIGRATE_TO_PRODUCT，抛出 PlaceProductCanonicalBlockedError。
 */
export function assertPlaceCanonicalTypeAllowed(metadata: unknown): void {
  const canonicalType = extractCanonicalTypeFromMetadata(metadata);
  if (!canonicalType) return;
  if (!isCanonicalTypeBlockedForNewPlaces(canonicalType)) return;

  const entry = getIcelandCanonicalMigration(canonicalType);
  const taxonomy = entry?.targetTaxonomy;
  const targetHint = taxonomy
    ? `${taxonomy.productType}/${taxonomy.categoryCode}/${taxonomy.subtypeCode}`
    : entry?.experienceDefinitionCode;

  throw new PlaceProductCanonicalBlockedError(
    canonicalType,
    `canonicalType "${canonicalType}" 属于旅行产品，不能写入 Place。请使用 Travel Product Catalog` +
      (targetHint ? `（${targetHint}）` : '') +
      '，地点侧仅保留冰川/码头/集合点等地理实体。',
    targetHint,
  );
}
