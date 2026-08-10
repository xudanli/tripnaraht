import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';
import {
  runDemoReplayScenario,
  runIcelandSelfDriveDemoCertification,
  loadDemoReplayScenarios,
} from './demo-replay.harness';
import { runIcelandSelfDriveKnowledgePackCertification } from './knowledge-pack-certification.rollup';
import { loadIcelandFuelStationProfiles } from '../fuel/iceland-fuel.loader';

describe('Iceland Self-Drive Demo + Certification Rollup', () => {
  it('lists competition demo scenarios', () => {
    const bundle = loadDemoReplayScenarios();
    expect(bundle.scenarios.length).toBeGreaterThanOrEqual(5);
    expect(bundle.scenarios.map((s) => s.scenarioId)).toEqual(
      expect.arrayContaining([
        'DEMO-IS-F208-STACKED-CRISIS',
        'DEMO-IS-ROAD-CLOSED-RUNBOOK',
        'DEMO-IS-CAMPER-WIND-ETA',
        'DEMO-IS-DAYLIGHT-PLOW-CLIENT',
        'DEMO-IS-ATTRACTION-WINTER-ACCESS',
        'DEMO-IS-LODGING-HOURS-UNKNOWN',
        'DEMO-IS-INSURANCE-COVERAGE-GAP',
      ]),
    );
  });

  it('daylight + plow situation projects iOS client fields', () => {
    const scenario = loadDemoReplayScenarios().scenarios.find(
      (s) => s.scenarioId === 'DEMO-IS-DAYLIGHT-PLOW-CLIENT',
    )!;
    const result = runDemoReplayScenario(scenario);
    expect(result.daylightLoad?.stack.fullLoadStack).toBe(true);
    expect(result.winter?.snowPlow?.plowServiceBand).toBe('REDUCED');
    expect(['NEED_CONFIRM', 'REPLAN_REQUIRED', 'BLOCK']).toContain(
      result.verdict.gate,
    );
  });

  it('F208 stacked crisis does not ALLOW', () => {
    const scenario = loadDemoReplayScenarios().scenarios.find(
      (s) => s.scenarioId === 'DEMO-IS-F208-STACKED-CRISIS',
    )!;
    const result = runDemoReplayScenario(scenario);
    expect(['REPLAN_REQUIRED', 'BLOCK']).toContain(result.verdict.gate);
    expect(result.verdict.gate).not.toBe('ALLOW');
    expect(result.runbook?.verifiedProposal).toBe(true);
  });

  it('evaluate entry produces consistent gate for paved clear-ish day', () => {
    const vik = loadIcelandFuelStationProfiles().stations.find(
      (s) => s.poiId === 'n1_vik_south_anchor',
    )!;
    const result = evaluateIcelandSelfDriveSituation({
      tripId: 't1',
      vehicleRoadFit: {
        vehicleClass: 'SEDAN',
        roadSegmentId: 'IS-R1',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
      },
      fuel: {
        estimatedRangeKm: 400,
        fuelTypeNeeded: 'PETROL',
        stationsAhead: [{ profile: vik, distanceKm: 80 }],
      },
    });
    expect(['ALLOW', 'NEED_CONFIRM']).toContain(result.verdict.gate);
    expect(result.schemaId).toBe('tripnara.iceland.self_drive_situation@v1');
  });

  it('passes demo replay certification', () => {
    const report = runIcelandSelfDriveDemoCertification();
    const failed = report.results.filter((r) => !r.passed);
    expect(failed).toEqual([]);
  });

  it('full knowledge pack certification rollup is green', () => {
    const report = runIcelandSelfDriveKnowledgePackCertification();
    expect(report.failed).toBe(0);
    expect(report.total).toBeGreaterThanOrEqual(25);
    expect(report.suites.map((s) => s.name)).toEqual(
      expect.arrayContaining(['fuel', 'runbooks', 'roadWeather', 'demoReplay']),
    );
  });
});
