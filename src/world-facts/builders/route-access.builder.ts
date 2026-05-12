/** route_direction:{id}:vehicle_required — factKey 约定（与 ingest 对齐） */
const ROUTE_VEHICLE_PREDICATE_SUFFIX = 'vehicle_required';

export function routeVehicleFactKey(routeDirectionId: string): string {
  return `route_direction:${routeDirectionId}:${ROUTE_VEHICLE_PREDICATE_SUFFIX}`;
}
