export type GuideVehicleType = '2wd' | '4x4' | 'suv' | 'campervan';

export function mapGuideVehicleType(input?: {
  vehicleType?: string;
  transportMode?: string;
}): GuideVehicleType {
  const vt = input?.vehicleType?.toLowerCase();
  if (vt === '4x4' || vt === '4wd' || vt === 'four_by_four') return '4x4';
  if (vt === 'suv') return 'suv';
  if (vt === 'campervan' || vt === 'camper') return 'campervan';
  if (vt === '2wd' || vt === 'sedan') return '2wd';

  const tm = input?.transportMode;
  if (tm === 'bus' || tm === 'tour') return '2wd';
  return '2wd';
}
