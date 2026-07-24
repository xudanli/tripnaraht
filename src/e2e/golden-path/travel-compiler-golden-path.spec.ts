import {
  assertGoldenPathProjection,
  runTravelCompilerGoldenPath,
} from './travel-compiler-golden-path.harness';

describe('Travel Compiler Golden Path (CTRE)', () => {
  it('compiles Golden Circle, projects full itinerary, and applies VERIFY SSOT', async () => {
    const result = await runTravelCompilerGoldenPath();
    assertGoldenPathProjection(result);
    expect(result.projectedItinerary.metadata?.source).toBe('canonical_travel_graph@v0');
  });

  it('recompiles incrementally after simulated REPAIR', async () => {
    const result = await runTravelCompilerGoldenPath({ simulateRepair: true });
    assertGoldenPathProjection(result);
    expect(result.repairRecompile?.incremental?.merged).toBe(true);
    expect(result.repairRecompile?.graph?.stats.poiResolved).toBeGreaterThanOrEqual(4);

    const finalPoiIds = (result.finalItinerary?.days[0]?.items ?? [])
      .map((i) => i.metadata?.canonical_poi_id)
      .filter(Boolean);
    expect(finalPoiIds).toContain('is.blue_lagoon');
  });
});
