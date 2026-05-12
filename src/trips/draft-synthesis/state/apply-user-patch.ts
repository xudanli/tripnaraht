import { bumpTripDraftStateVersion } from './build-trip-draft-state';
import type { TripDraftState } from './trip-draft-state.types';
import type { UserPatch } from './user-patch.types';

function uniq(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * 将单次用户补丁应用到 TripDraftState（版本 +1；selections / intent 增量演化）。
 */
export function applyUserPatchToTripDraftState(state: TripDraftState, patch: UserPatch): TripDraftState {
  let next = bumpTripDraftStateVersion(state);

  switch (patch.type) {
    case 'replace_place': {
      if (!patch.day || !patch.slot || !patch.newPlaceId) return next;
      const selections = next.selections.map((s) =>
        s.day === patch.day && s.slot === patch.slot ? { ...s, placeId: patch.newPlaceId! } : s,
      );
      next = { ...next, selections };
      break;
    }
    case 'remove_slot': {
      if (!patch.day || !patch.slot) return next;
      next = {
        ...next,
        selections: next.selections.filter((s) => !(s.day === patch.day && s.slot === patch.slot)),
      };
      break;
    }
    case 'lock_place': {
      if (!patch.targetPlaceId) return next;
      const locked = uniq([...(next.intent.lockedPlaceIds ?? []), patch.targetPlaceId]);
      next = { ...next, intent: { ...next.intent, lockedPlaceIds: locked } };
      break;
    }
    case 'prefer_zone': {
      if (!patch.zone) return next;
      const zones = [...(next.intent.preferredZones ?? []), patch.zone];
      next = { ...next, intent: { ...next.intent, preferredZones: zones } };
      if (patch.day != null) {
        next = {
          ...next,
          topology: {
            ...next.topology,
            currentZone: patch.zone,
          },
        };
      }
      break;
    }
    case 'add_constraint': {
      const hints = [...(next.intent.constraintHints ?? [])];
      if (patch.constraintText?.trim()) hints.push(patch.constraintText.trim());
      next = { ...next, intent: { ...next.intent, constraintHints: hints } };
      if (patch.constraintText?.trim()) {
        next = {
          ...next,
          uncertainty: {
            ...next.uncertainty,
            items: [
              ...next.uncertainty.items,
              {
                type: 'availability',
                level: 'medium',
                targetId: patch.targetPlaceId,
              },
            ],
          },
        };
      }
      break;
    }
    case 'change_intensity': {
      if (!patch.intensity) return next;
      next = { ...next, intent: { ...next.intent, intensity: patch.intensity } };
      break;
    }
    default:
      return next;
  }

  return next;
}
