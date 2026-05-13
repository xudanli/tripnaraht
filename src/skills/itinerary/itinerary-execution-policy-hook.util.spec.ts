import {
  applyExecutionPolicyHookToItineraryDays,
  shouldSuppressCorridorDriveInjection,
} from './itinerary-execution-policy-hook.util';
import type { ItineraryDay } from '../../agent/interfaces/trip-plan.interface';
import { freezeExecutionPolicyHook } from '../../world/operational/execution-governance.contract';

const hookBlocked = freezeExecutionPolicyHook({
  policySource: 'test',
  policyGeneratedAt: 0,
  causedByPolicies: ['safetravel.gate.block'],
  policyStrengthDominant: 'hard',
  executionStatus: 'blocked',
  denyLongDistanceAutorouting: true,
  maxSingleLegDriveHours: 2,
  forcedMinimumVehicleClass: null,
  haltAutomatedExecution: true,
  arbitrationConfidence: 0.4,
  rawSeverity: 'BLOCKED',
  blockingSummary: ['safetravel_gate:BLOCK'],
  recoverySuggestions: [{ type: 'reroute', rationale: ['wait'] }],
});

describe('itinerary-execution-policy-hook', () => {
  it('shouldSuppressCorridorDriveInjection when denied or blocked', () => {
    expect(shouldSuppressCorridorDriveInjection(undefined)).toBe(false);
    expect(
      shouldSuppressCorridorDriveInjection(
        freezeExecutionPolicyHook({
          policySource: 't',
          policyGeneratedAt: 1,
          causedByPolicies: [],
          policyStrengthDominant: 'soft',
          executionStatus: 'caution',
          denyLongDistanceAutorouting: true,
          forcedMinimumVehicleClass: null,
          haltAutomatedExecution: false,
          arbitrationConfidence: 1,
          rawSeverity: 'CAUTION',
          blockingSummary: [],
        }),
      ),
    ).toBe(true);
    expect(shouldSuppressCorridorDriveInjection(hookBlocked)).toBe(true);
  });

  it('blocked clears days (no placeholder itinerary)', () => {
    const days: ItineraryDay[] = [
      {
        date: '2026-06-01',
        items: [
          {
            id: 'x',
            type: 'POI',
            start_window: '09:00',
            end_window: '11:00',
            location_ref: { name: 'A' },
            evidence_refs: [],
            verified: false,
            verification_status: 'UNVERIFIED',
          },
        ],
      },
    ];
    const out = applyExecutionPolicyHookToItineraryDays(days, hookBlocked, true);
    expect(out.days.length).toBe(0);
    expect(out.resultType).toBe('execution_block');
    expect(out.partialExecutionState).toBe('blocked');
  });

  it('caps DRIVE metadata when maxSingleLegDriveHours set', () => {
    const days: ItineraryDay[] = [
      {
        date: '2026-06-01',
        items: [
          {
            id: 'd1',
            type: 'DRIVE',
            start_window: '10:00',
            end_window: '12:00',
            location_ref: { name: '→' },
            evidence_refs: [],
            verified: false,
            verification_status: 'UNVERIFIED',
          },
        ],
      },
    ];
    const hook = freezeExecutionPolicyHook({
      policySource: 'test',
      policyGeneratedAt: 2,
      causedByPolicies: ['weather.condition.elevated'],
      policyStrengthDominant: 'hard',
      executionStatus: 'dangerous',
      denyLongDistanceAutorouting: false,
      maxSingleLegDriveHours: 4,
      forcedMinimumVehicleClass: '4WD_OR_EQUIVALENT',
      haltAutomatedExecution: false,
      arbitrationConfidence: 0.8,
      rawSeverity: 'DANGEROUS',
      blockingSummary: [],
    });
    const out = applyExecutionPolicyHookToItineraryDays(days, hook, false);
    expect(out.days[0].items[0].governance?.max_drive_leg_hours).toBe(4);
  });
});
