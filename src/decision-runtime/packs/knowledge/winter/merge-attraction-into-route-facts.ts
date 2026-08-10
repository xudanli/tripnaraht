/**
 * Merge attraction winter access into Iceland route facts.
 */

import type { IcelandSelfDriveRouteFacts } from '../demo/iceland-self-drive-route-facts.types';
import type { AttractionWinterAccessInput } from './iceland-winter-knowledge.types';

export function mergeAttractionIntoRouteFacts(
  facts: IcelandSelfDriveRouteFacts,
  attraction: AttractionWinterAccessInput | undefined,
): IcelandSelfDriveRouteFacts {
  if (!attraction?.poiId) return facts;
  // Prefer explicit upstream attractionAccess
  if (facts.winter?.attractionAccess?.poiId) return facts;

  return {
    ...facts,
    winter: {
      ...facts.winter,
      attractionAccess: attraction,
    },
  };
}
