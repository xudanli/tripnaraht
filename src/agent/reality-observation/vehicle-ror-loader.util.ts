/**
 * 从 Trip.metadata（冰岛自驾 drivingSettings）解析 ROR 车辆事实。
 */

export type RorVehicleProfile = {
  driveType: '2WD' | '4WD' | 'AWD' | 'UNKNOWN';
  is4wd: boolean | null;
  vehicleClass?: string | null;
  vehicleClassLabel?: string | null;
  acquisition?: string | null;
  rentalCompanyName?: string | null;
  source: 'ISD_DRIVING_SETTINGS' | 'TRIP_METADATA' | 'INFERRED';
};

export type RorVehicleFacts = {
  'vehicle.profile': RorVehicleProfile;
  'vehicle.driveType': RorVehicleProfile['driveType'];
  'vehicle.rentalRestriction': {
    froad: boolean;
    highland: boolean;
    gravel: boolean;
    wading: boolean;
    restrictions: string[];
  };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readIsdVehicle(meta: unknown): Record<string, unknown> | null {
  const root = asRecord(meta);
  if (!root) return null;
  const isd = asRecord(root.icelandSelfDrive) ?? (root.productLine === 'iceland_self_drive' ? root : null);
  if (!isd) return null;
  const driving = asRecord(isd.drivingSettings);
  const vehicle = asRecord(driving?.vehicle);
  return vehicle;
}

function resolveDriveType(vehicle: Record<string, unknown>): RorVehicleProfile['driveType'] {
  const raw = String(vehicle.driveType ?? vehicle.drivetrain ?? '').toUpperCase();
  if (raw === '4WD' || raw === 'AWD' || raw === '2WD') return raw;
  if (vehicle.is4wd === true) return '4WD';
  if (vehicle.is4wd === false) return '2WD';
  const cls = String(vehicle.vehicleClass ?? '').toLowerCase();
  if (/4x4|4wd|awd|super/.test(cls)) return '4WD';
  if (cls) return '2WD';
  return 'UNKNOWN';
}

/**
 * 解析车辆档案；无 ISD/元数据时返回 null（保持 FETCHABLE 缺口）。
 */
export function extractVehicleFactsFromTripMetadata(
  metadata: unknown,
): RorVehicleFacts | null {
  const vehicle = readIsdVehicle(metadata);
  if (!vehicle) {
    const root = asRecord(metadata);
    const vp = asRecord(root?.vehicleProfile) ?? asRecord(root?.vehicle);
    if (!vp) return null;
    const driveType = resolveDriveType(vp);
    const restrictions = Array.isArray(vp.rentalRestrictions)
      ? vp.rentalRestrictions.map(String)
      : [];
    return {
      'vehicle.profile': {
        driveType,
        is4wd: driveType === '4WD' || driveType === 'AWD' ? true : driveType === '2WD' ? false : null,
        vehicleClass: vp.vehicleClass != null ? String(vp.vehicleClass) : null,
        vehicleClassLabel: vp.vehicleClassLabel != null ? String(vp.vehicleClassLabel) : null,
        acquisition: vp.acquisition != null ? String(vp.acquisition) : null,
        rentalCompanyName: vp.rentalCompanyName != null ? String(vp.rentalCompanyName) : null,
        source: 'TRIP_METADATA',
      },
      'vehicle.driveType': driveType,
      'vehicle.rentalRestriction': {
        froad: !restrictions.includes('no_f_road'),
        highland: !restrictions.includes('no_highland'),
        gravel: !restrictions.includes('no_gravel'),
        wading: !restrictions.includes('no_wading'),
        restrictions,
      },
    };
  }

  const driveType = resolveDriveType(vehicle);
  const restrictions = Array.isArray(vehicle.rentalRestrictions)
    ? vehicle.rentalRestrictions.map(String)
    : [];

  return {
    'vehicle.profile': {
      driveType,
      is4wd:
        vehicle.is4wd === true
          ? true
          : vehicle.is4wd === false
            ? false
            : driveType === '4WD' || driveType === 'AWD'
              ? true
              : driveType === '2WD'
                ? false
                : null,
      vehicleClass: vehicle.vehicleClass != null ? String(vehicle.vehicleClass) : null,
      vehicleClassLabel:
        vehicle.vehicleClassLabel != null ? String(vehicle.vehicleClassLabel) : null,
      acquisition: vehicle.acquisition != null ? String(vehicle.acquisition) : null,
      rentalCompanyName:
        vehicle.rentalCompanyName != null ? String(vehicle.rentalCompanyName) : null,
      source: 'ISD_DRIVING_SETTINGS',
    },
    'vehicle.driveType': driveType,
    'vehicle.rentalRestriction': {
      froad: !restrictions.includes('no_f_road'),
      highland: !restrictions.includes('no_highland'),
      gravel: !restrictions.includes('no_gravel'),
      wading: !restrictions.includes('no_wading'),
      restrictions,
    },
  };
}

export function isSelfDriveTripMetadata(metadata: unknown, destination?: string | null): boolean {
  const root = asRecord(metadata);
  if (!root) {
    return /冰岛|Iceland|\bIS\b/i.test(destination ?? '');
  }
  if (root.productLine === 'iceland_self_drive') return true;
  const isd = asRecord(root.icelandSelfDrive);
  if (isd?.productLine === 'iceland_self_drive') return true;
  if (asRecord(isd?.drivingSettings)?.vehicle) return true;
  return /冰岛|Iceland|\bIS\b/i.test(destination ?? '') || destination === 'IS';
}
