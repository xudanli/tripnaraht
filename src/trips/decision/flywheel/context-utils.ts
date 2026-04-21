export type VehicleClass = '2WD' | 'SUV' | 'MODIFIED_4X4';

export function buildContextKey(params: {
  countryCode: string;
  month: number; // 1-12
  vehicleClass: VehicleClass;
}): string {
  const cc = String(params.countryCode ?? '').trim().toUpperCase();
  const m = Math.max(1, Math.min(12, Math.floor(Number(params.month))));
  const vc = String(params.vehicleClass ?? '').trim().toUpperCase();
  return `${cc}:${m}:${vc}`;
}

