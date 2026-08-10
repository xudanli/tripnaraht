/**
 * Merge lodging hours uncertainty into Iceland route facts.
 */

import type { IcelandSelfDriveRouteFacts } from '../demo/iceland-self-drive-route-facts.types';
import type { LodgingHoursInput } from './iceland-winter-knowledge.types';

export function mergeLodgingIntoRouteFacts(
  facts: IcelandSelfDriveRouteFacts,
  lodging: LodgingHoursInput | undefined,
): IcelandSelfDriveRouteFacts {
  if (!lodging?.openingMode) return facts;
  if (facts.winter?.lodging?.openingMode) return facts; // prefer upstream

  return {
    ...facts,
    winter: {
      ...facts.winter,
      lodging,
    },
  };
}
