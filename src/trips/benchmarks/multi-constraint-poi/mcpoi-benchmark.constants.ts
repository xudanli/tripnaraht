import { MCPOI_BENCHMARK_TRIP_ID, MCPOI_BENCHMARK_VERSION } from '../../arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';

export { MCPOI_BENCHMARK_TRIP_ID, MCPOI_BENCHMARK_VERSION };

export function isMcpoiBenchmarkTrip(input: {
  tripId?: string;
  metadata?: unknown;
}): boolean {
  if (input.tripId === MCPOI_BENCHMARK_TRIP_ID) return true;
  const meta = input.metadata as Record<string, unknown> | null | undefined;
  return meta?.fixture === MCPOI_BENCHMARK_VERSION;
}
