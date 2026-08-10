/**
 * Bootstrap / ensure driving-settings state for memory Trip Shells.
 */

import type { IcelandTripShellContextPayload } from '../types/iceland-trip-shell-preview.types';
import type { IcelandSelfDriveDrivingSettingsState } from '../types/iceland-self-drive.types';
import { buildInitialDrivingSettings } from '../services/iceland-self-drive-completion.util';
import { mergeDrivingSettings } from '../services/iceland-self-drive-driving-settings.util';

export function ensureShellDrivingSettings(
  ctx: IcelandTripShellContextPayload,
): IcelandSelfDriveDrivingSettingsState {
  if (ctx.drivingSettings) {
    return ctx.drivingSettings;
  }
  const base = buildInitialDrivingSettings('rent');
  if (!ctx.vehicleProfile) return base;
  return mergeDrivingSettings(base, {
    vehicle: {
      is4wd: ctx.vehicleProfile.is4wd ?? null,
      vehicleClass:
        ctx.vehicleProfile.is4wd === true
          ? 'suv_4wd'
          : ctx.vehicleProfile.is4wd === false
            ? 'sedan_2wd'
            : undefined,
      rentalRestrictions: [
        ...(ctx.vehicleProfile.allowsFRoad === false ? ['no_f_road'] : []),
        ...(ctx.vehicleProfile.allowsRiverCrossing === false ? ['no_wading'] : []),
      ],
    },
  });
}

export function bootstrapShellDrivingSettings(
  vehicleProfile?: IcelandTripShellContextPayload['vehicleProfile'],
): IcelandSelfDriveDrivingSettingsState {
  return ensureShellDrivingSettings({ vehicleProfile });
}

export function syncVehicleProfileFromSettings(
  settings: IcelandSelfDriveDrivingSettingsState,
  prev?: IcelandTripShellContextPayload['vehicleProfile'],
): IcelandTripShellContextPayload['vehicleProfile'] {
  const restrictions = settings.vehicle.rentalRestrictions ?? [];
  const noFRoad =
    restrictions.includes('no_f_road') || restrictions.includes('no_highland');
  const noWading = restrictions.includes('no_wading');
  const is4wd = settings.vehicle.is4wd;
  return {
    ...prev,
    is4wd: is4wd ?? prev?.is4wd,
    allowsFRoad: noFRoad ? false : is4wd === true ? true : prev?.allowsFRoad,
    allowsRiverCrossing: noWading ? false : prev?.allowsRiverCrossing,
    driveType:
      is4wd === true ? '4WD' : is4wd === false ? '2WD' : prev?.driveType,
  };
}
