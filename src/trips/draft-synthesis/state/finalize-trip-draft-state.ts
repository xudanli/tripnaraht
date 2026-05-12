import type { CreateTripDraftDto, DraftDay } from '../../dto/trip-draft.dto';
import { buildTripDraftStateFromDto } from './build-trip-draft-state';
import { extractSelectionsFromValidatedDraftDays } from './extract-selections.util';
import type { TripDraftEngineMode, TripDraftState } from './trip-draft-state.types';

/**
 * 将校验后的草案天转换为填满 selections 的 TripDraftState（仿真 / diff / patch 的输入）。
 */
export function finalizeTripDraftStateFromValidatedDraft(opts: {
  tripId: string;
  dto: CreateTripDraftDto;
  timezone: string;
  validatedDays: DraftDay[];
  mode: TripDraftEngineMode;
}): TripDraftState {
  const base = buildTripDraftStateFromDto({
    tripId: opts.tripId,
    dto: opts.dto,
    timezone: opts.timezone,
    mode: opts.mode,
  });
  const selections = extractSelectionsFromValidatedDraftDays(opts.validatedDays);
  return { ...base, selections };
}
