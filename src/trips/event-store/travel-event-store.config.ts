/**
 * Travel Event Store feature flag.
 *
 * Disabled by default. Enable with TRAVEL_EVENT_STORE_ENABLED=true.
 */
export function isTravelEventStoreEnabled(): boolean {
  return process.env.TRAVEL_EVENT_STORE_ENABLED === 'true';
}
