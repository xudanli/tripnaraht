/** Memory Trip Shell ids look like `trip_<hex>`; Prisma trips are UUIDs. */
export function isMemoryShellTripId(tripId: string): boolean {
  return /^trip_[a-f0-9]{8,}$/i.test(tripId.trim());
}
