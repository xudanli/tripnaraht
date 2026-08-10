import { assessIcelandFuel } from './assess-iceland-fuel';
import { fuelAssessmentToReachabilitySummary } from './fuel-assessment-bridge';
import { runFuelAssessmentCertification } from './fuel-certification.harness';
import {
  loadIcelandFuelPolicy,
  loadIcelandFuelRunbook,
  loadIcelandFuelStationProfiles,
} from './iceland-fuel.loader';
import {
  assessAndExecuteFuelRunbook,
  executeIcelandFuelInsufficientRunbook,
} from './iceland-fuel-runbook.executor';
import { runbookExecutionToRepairInstructions } from '../runbooks/runbook-to-repair.bridge';

describe('Iceland Fuel P0 (WP2)', () => {
  const policy = loadIcelandFuelPolicy();

  it('loads station profiles and active policy', () => {
    const stations = loadIcelandFuelStationProfiles();
    expect(stations.stations.length).toBeGreaterThanOrEqual(6);
    expect(policy.status).toBe('ACTIVE');
    expect(policy.allUnknownBlocks).toBe(true);
  });

  it('PASS when range covers next verified station + dynamic reserve', () => {
    const vik = loadIcelandFuelStationProfiles().stations.find(
      (s) => s.poiId === 'n1_vik_south_anchor',
    )!;
    const result = assessIcelandFuel(
      {
        estimatedRangeKm: 320,
        fuelTypeNeeded: 'PETROL',
        stationsAhead: [{ profile: vik, distanceKm: 120 }],
      },
      policy,
    );
    expect(result.status).toBe('PASS');
    expect(result.nextPrimaryStation).toBe('n1_vik_south_anchor');
  });

  it('BLOCK when all station facts unknown', () => {
    const stations = loadIcelandFuelStationProfiles().stations.filter(
      (s) => s.reliability === 'UNKNOWN' && s.openingMode === 'UNKNOWN',
    );
    expect(stations.length).toBeGreaterThanOrEqual(2);
    const result = assessIcelandFuel(
      {
        estimatedRangeKm: 500,
        fuelTypeNeeded: 'PETROL',
        stationsAhead: stations.map((profile, i) => ({
          profile,
          distanceKm: 50 + i * 40,
        })),
      },
      policy,
    );
    expect(result.status).toBe('BLOCK');
    expect(result.reasons).toContain('REFUSE_FAKE_EXECUTABLE');
  });

  it('bridges BLOCK assessment to CRITICAL reachability summary', () => {
    const summary = fuelAssessmentToReachabilitySummary(
      {
        status: 'BLOCK',
        estimatedRangeKm: 80,
        requiredRangeKm: 200,
        reserveRangeKm: 85,
        nextPrimaryStation: 'n1_vik_south_anchor',
        assumptions: [],
        evidence: [],
        reasons: ['INSUFFICIENT_RANGE_TO_RELIABLE_STATION'],
        recommendedAction: 'REFUEL_NOW',
      },
      { legId: 'leg1', date: '2026-07-01' },
    );
    expect(summary.severity).toBe('CRITICAL');
    expect(summary.safeBeforeNextFuel).toBe(false);
  });

  it('executes IS_RB_FUEL_INSUFFICIENT to verified proposal', () => {
    const runbook = loadIcelandFuelRunbook();
    expect(runbook.runbookId).toBe('IS_RB_FUEL_INSUFFICIENT');

    const vik = loadIcelandFuelStationProfiles().stations.find(
      (s) => s.poiId === 'n1_vik_south_anchor',
    )!;
    const { assessment, runbook: execution } = assessAndExecuteFuelRunbook(
      {
        estimatedRangeKm: 80,
        fuelTypeNeeded: 'PETROL',
        stationsAhead: [{ profile: vik, distanceKm: 200 }],
      },
      { userSafeStopped: true },
    );

    expect(assessment.status).toBe('BLOCK');
    expect(execution).toBeDefined();
    expect(execution!.verifiedProposal).toBe(true);
    expect(execution!.createPlanVersion).toBe(true);
    expect(execution!.stepsCompleted).toContain('VERIFY_PROPOSAL');
    expect(execution!.candidateOperations).toContain('ADD_STOP');

    const repairs = runbookExecutionToRepairInstructions(execution!);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs[0]?.metadata?.runbookId).toBe('IS_RB_FUEL_INSUFFICIENT');

    const direct = executeIcelandFuelInsufficientRunbook({
      assessment,
      userSafeStopped: true,
    });
    expect(direct.runbookId).toBe('IS_RB_FUEL_INSUFFICIENT');
  });

  it('passes fuel assessment certification suite', () => {
    const report = runFuelAssessmentCertification();
    const failed = report.results.filter((r) => !r.passed);
    expect(failed).toEqual([]);
    expect(report.passed).toBe(report.total);
    expect(report.total).toBeGreaterThanOrEqual(6);
  });
});
