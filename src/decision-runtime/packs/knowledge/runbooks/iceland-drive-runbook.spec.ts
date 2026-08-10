import {
  executeIcelandDriveRunbook,
  executeIcelandDriveRunbookForEvent,
} from './iceland-drive-runbook.executor';
import {
  listActiveIcelandDriveRunbookIds,
  loadIcelandDriveRunbook,
  loadIcelandDriveRunbookRegistry,
  resolveRunbookIdForEventType,
} from './iceland-drive-runbook.loader';
import { runRunbookExecutionCertification } from './runbook-certification.harness';

describe('Iceland Drive Runbook Runtime (WP3)', () => {
  it('registry lists four ACTIVE P0 runbooks', () => {
    const registry = loadIcelandDriveRunbookRegistry();
    expect(registry.schemaId).toBe('tripnara.iceland.drive_runbook_registry@v1');
    expect(registry.status).toBe('ACTIVE');
    expect(listActiveIcelandDriveRunbookIds()).toEqual(
      expect.arrayContaining([
        'IS_RB_ROAD_CLOSURE',
        'IS_RB_STRONG_WIND',
        'IS_RB_FUEL_INSUFFICIENT',
        'IS_RB_BOOKING_ETA_MISS',
      ]),
    );
    expect(listActiveIcelandDriveRunbookIds()).toHaveLength(4);
  });

  it('resolves event types to runbook ids', () => {
    expect(resolveRunbookIdForEventType('ROAD_CLOSURE')).toBe('IS_RB_ROAD_CLOSURE');
    expect(resolveRunbookIdForEventType('STRONG_WIND')).toBe('IS_RB_STRONG_WIND');
    expect(resolveRunbookIdForEventType('FUEL_INSUFFICIENT')).toBe(
      'IS_RB_FUEL_INSUFFICIENT',
    );
    expect(resolveRunbookIdForEventType('BOOKING_ETA_MISS')).toBe(
      'IS_RB_BOOKING_ETA_MISS',
    );
  });

  it('road closure reaches verified proposal with plan version prep', () => {
    const result = executeIcelandDriveRunbook('IS_RB_ROAD_CLOSURE', {
      eventType: 'ROAD_CLOSURE',
      userSafeStopped: true,
      roadSegmentId: 'F208',
      roadStatus: 'CLOSED',
      proposedOperations: ['REROUTE', 'END_DAY_EARLY'],
    });
    expect(result.verifiedProposal).toBe(true);
    expect(result.createPlanVersion).toBe(true);
    expect(result.commandType).toBe('APPLY_ROAD_CLOSURE_REPAIR');
    expect(result.immediateSafetyActions).toContain('DO_NOT_ENTER_CLOSED_SEGMENT');
    expect(result.stepsCompleted).toContain('AWAIT_USER_CONFIRM');
    expect(loadIcelandDriveRunbook('IS_RB_ROAD_CLOSURE').evidence.length).toBeGreaterThan(
      0,
    );
  });

  it('strong wind requires delay range and never claims exact minutes alone', () => {
    const result = executeIcelandDriveRunbook('IS_RB_STRONG_WIND', {
      eventType: 'STRONG_WIND',
      windGustMs: 22,
      vehicleClass: '4x4',
      roadExposure: 'HIGH',
      estimatedDelayMinRange: [25, 45],
      proposedOperations: ['SHORTEN', 'SHIFT'],
    });
    expect(result.verifiedProposal).toBe(true);
    expect(result.prohibitedActions).toContain('CLAIM_EXACT_DELAY_WITHOUT_RANGE');
    expect(result.proposalSummary).toContain('delayMin=25-45');
  });

  it('booking ETA miss verifies shorten path', () => {
    const result = executeIcelandDriveRunbookForEvent({
      eventType: 'BOOKING_ETA_MISS',
      bookingId: 'b1',
      etaMinutesLate: 40,
      shortenableSlotIds: ['s1'],
      proposedOperations: ['SHORTEN'],
    });
    expect(result?.runbookId).toBe('IS_RB_BOOKING_ETA_MISS');
    expect(result?.verifiedProposal).toBe(true);
  });

  it('booking ETA miss without shortenable slots uses fallback', () => {
    const result = executeIcelandDriveRunbook('IS_RB_BOOKING_ETA_MISS', {
      eventType: 'BOOKING_ETA_MISS',
      bookingId: 'b1',
      etaMinutesLate: 40,
      shortenableSlotIds: [],
      proposedOperations: ['SHORTEN'],
    });
    expect(result.verifiedProposal).toBe(true);
    expect(result.fallbackApplied?.when).toBe('no_shortenable_slots');
  });

  it('passes runbook execution certification suite (4 P0)', () => {
    const report = runRunbookExecutionCertification();
    const failed = report.results.filter((r) => !r.passed);
    expect(failed).toEqual([]);
    expect(report.total).toBe(4);
  });

  it('road closure resolves curated safeStop from F208 when missing', () => {
    const result = executeIcelandDriveRunbook('IS_RB_ROAD_CLOSURE', {
      eventType: 'ROAD_CLOSURE',
      userSafeStopped: true,
      roadSegmentId: 'F208',
      roadStatus: 'CLOSED',
      proposedOperations: ['REROUTE', 'END_DAY_EARLY'],
    });
    expect(result.verifiedProposal).toBe(true);
    expect(result.stepsCompleted).toContain('RESOLVE_SAFE_STOP');
    expect(result.contextEcho.safeStopPoiId).toBeTruthy();
    expect(result.proposalSummary).toContain('safeStop=');
  });

  it('road closure keeps caller-supplied catalog safeStop id', () => {
    const result = executeIcelandDriveRunbook('IS_RB_ROAD_CLOSURE', {
      eventType: 'ROAD_CLOSURE',
      userSafeStopped: true,
      roadSegmentId: 'F208',
      roadStatus: 'CLOSED',
      safeStopPoiId: 'olis_selfoss_ring',
      proposedOperations: ['REROUTE'],
    });
    expect(result.stepsCompleted).toContain('SAFE_STOP_CATALOG_HIT');
    expect(result.contextEcho.safeStopPoiId).toBe('olis_selfoss_ring');
  });
});
