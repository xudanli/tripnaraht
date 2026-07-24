import {
  ICELAND_MIGRATE_TO_PRODUCT_TYPES,
  isCanonicalTypeBlockedForNewPlaces,
  getIcelandCanonicalMigration,
} from './iceland-poi-to-product-migration';
import { IcelandCanonicalType } from '../../places/types/iceland-poi-categories';
import { TravelProductType } from '../types/product-taxonomy.types';
import { ICELAND_P0_EXPERIENCE_DEFINITION_SEEDS } from './iceland-p0-experience-definitions.seed';
import { PRODUCT_TYPE_TO_ITINERARY_ITEM_TYPE } from '../types/catalog-entities.types';
import { mapPrismaItemTypeToCatalogDisplay } from '../types/itinerary-product-binding.types';

describe('iceland-poi-to-product-migration', () => {
  it('blocks tour-like canonical types from new Place writes', () => {
    expect(isCanonicalTypeBlockedForNewPlaces(IcelandCanonicalType.GLACIER_WALK)).toBe(
      true,
    );
    expect(isCanonicalTypeBlockedForNewPlaces(IcelandCanonicalType.WHALE_WATCHING)).toBe(
      true,
    );
    expect(
      isCanonicalTypeBlockedForNewPlaces(IcelandCanonicalType.ATTRACTION_NATURE_GLACIER),
    ).toBe(false);
  });

  it('maps glacier walk to ACTIVITY_EXPERIENCE / GLACIER_HIKING', () => {
    const entry = getIcelandCanonicalMigration(IcelandCanonicalType.GLACIER_WALK);
    expect(entry?.action).toBe('MIGRATE_TO_PRODUCT');
    expect(entry?.targetTaxonomy?.productType).toBe(
      TravelProductType.ACTIVITY_EXPERIENCE,
    );
    expect(entry?.targetTaxonomy?.subtypeCode).toBe('GLACIER_HIKING');
  });

  it('covers every MIGRATE_TO_PRODUCT with a P0/P1 seed experience when phase is P0', () => {
    const p0Codes = new Set(
      ICELAND_P0_EXPERIENCE_DEFINITION_SEEDS.map((s) => s.code),
    );
    for (const type of ICELAND_MIGRATE_TO_PRODUCT_TYPES) {
      const entry = getIcelandCanonicalMigration(type);
      if (entry?.phasePriority === 'P0' && entry.experienceDefinitionCode) {
        expect(p0Codes.has(entry.experienceDefinitionCode)).toBe(true);
      }
    }
  });
});

describe('itinerary product binding', () => {
  it('prefers productType over prisma ACTIVITY→PLACE_VISIT default', () => {
    expect(
      mapPrismaItemTypeToCatalogDisplay('ACTIVITY', TravelProductType.GUIDED_TOUR),
    ).toBe('TOUR');
    expect(mapPrismaItemTypeToCatalogDisplay('ACTIVITY')).toBe('PLACE_VISIT');
  });

  it('maps all eight product types to display types', () => {
    expect(Object.keys(PRODUCT_TYPE_TO_ITINERARY_ITEM_TYPE)).toHaveLength(8);
  });
});
