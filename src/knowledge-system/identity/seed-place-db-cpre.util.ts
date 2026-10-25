/**
 * Golden Set Place.id (DB) → CPRE is.* via label pattern match + curated overrides.
 */

import { listActiveRegionPacks } from '../../trips/iceland-self-drive/packs/iceland-region-pack.registry';
import { ICELAND_POI_SLUG_RESOLVERS } from '../../poi-access-capacity/fixtures/iceland-poi-registry';

/** High-confidence curated Place.id → CPRE (Golden Set / known catalog) */
export const CURATED_PLACE_DB_TO_CPRE: Readonly<Record<string, string>> = {
  '381090': 'is.blue_lagoon',
  '381037': 'is.thingvellir',
  '381083': 'is.geysir',
  '381084': 'is.gullfoss',
  '381088': 'is.skaftafell',
  '381093': 'is.reynisfjara',
  '381099': 'is.jokulsarlon',
  '381087': 'is.skogafoss',
  '381080': 'is.seljalandsfoss',
  '381038': 'is.dyrholaey',
  '381108': 'is.dettifoss',
  '381127': 'is.myvatn',
  '381111': 'is.godafoss',
  '381122': 'is.krafla',
  '381458': 'is.landmannalaugar',
  '381039': 'is.kerid_crater',
};

export type PlaceDbCpreLink = {
  placeDbId: string;
  canonicalEntityId: string;
  label?: string;
  match: 'CURATED' | 'LABEL_PATTERN';
};

function matchLabelToCpre(label: string): string | null {
  const text = label.trim();
  if (!text) return null;
  for (const row of ICELAND_POI_SLUG_RESOLVERS) {
    if (row.patterns.some((re) => re.test(text))) return row.slug;
  }
  return null;
}

/**
 * Build place:db → CPRE links from curated map + active region pack entity labels.
 */
export function buildPlaceDbToCpreLinks(): PlaceDbCpreLink[] {
  const byDb = new Map<string, PlaceDbCpreLink>();

  for (const [placeDbId, canonicalEntityId] of Object.entries(CURATED_PLACE_DB_TO_CPRE)) {
    byDb.set(placeDbId, {
      placeDbId,
      canonicalEntityId,
      match: 'CURATED',
    });
  }

  for (const pack of listActiveRegionPacks()) {
    for (const ent of pack.entities ?? []) {
      if (ent.placeId == null) continue;
      const placeDbId = String(ent.placeId);
      if (byDb.has(placeDbId)) {
        const prev = byDb.get(placeDbId)!;
        byDb.set(placeDbId, {
          ...prev,
          label: ent.displayName || ent.label || prev.label,
        });
        continue;
      }
      const label = ent.displayName || ent.label || '';
      const canonical = matchLabelToCpre(label);
      if (!canonical) continue;
      byDb.set(placeDbId, {
        placeDbId,
        canonicalEntityId: canonical,
        label,
        match: 'LABEL_PATTERN',
      });
    }
  }

  return [...byDb.values()];
}
