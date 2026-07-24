/** Trip 范围 factKey：`trip:{tripId}:{suffix}` */
export function tripWorldFactKey(tripId: string, suffix: string): string {
  return `trip:${tripId}:${suffix}`;
}

export function parseTripIdFromWorldFactKey(factKey: string): string | undefined {
  const match = /^trip:([^:]+):/.exec(factKey);
  return match?.[1];
}
