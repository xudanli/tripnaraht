import {
  resolveEffectiveTravelerContext,
  effectiveTravelerContextToObservability,
} from './resolve-effective-traveler-context.util';
import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';
import type { AssembledTravelContextV1 } from '../context-assembly/assembled-context.types';
import { createDefaultUserTravelProfile } from '../../agent/memory/interfaces/user-travel-profile.interface';

function baseMemory(
  overrides: Partial<AgentMemoryContext> = {},
): AgentMemoryContext {
  return {
    snapshotId: 'snap-etc',
    snapshotVersion: 1,
    requestId: 'req-etc',
    userId: 'traveler_1',
    tripId: 'trip_1',
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    recentTripFeedbacks: [],
    domainInfluenceDigest: null,
    wishConstraintDigest: null,
    privateWishDigest: null,
    decisionProfilingDigest: null,
    negotiationDigest: null,
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
    ...overrides,
  };
}

describe('resolveEffectiveTravelerContext', () => {
  it('projects OS L1 pace/risk and L0 dietary into Domain×Semantic items', () => {
    const profile = {
      ...createDefaultUserTravelProfile('traveler_1'),
      pacePreference: 'SLOW' as const,
      riskTolerance: 'LOW' as const,
      travelPhilosophy: 'RELAXED' as const,
      confidence: 0.8,
      source: 'explicit' as const,
    };
    const ctx = resolveEffectiveTravelerContext({
      memory: baseMemory({
        userProfile: profile,
        userBasics: {
          dietaryRestrictions: ['no_pork'],
          preferredAttractionTypes: ['NATURE'],
        },
        travelPreference: {
          pacePreference: 'SLOW',
          mergedInterests: ['NATURE'],
        },
      }),
      now: new Date('2026-08-12T04:00:00.000Z'),
    });

    expect(ctx.schemaId).toBe('tripnara.effective_traveler_context@v1');
    expect(ctx.consumptionMode).toBe('SHADOW');
    expect(ctx.subjectId).toBe('traveler_1');
    expect(ctx.effective.pace?.value).toBe('SLOW');
    expect(ctx.effective.pace?.layer).toBe('L1_PERSISTENT');
    expect(ctx.effective.dietaryConstraints?.semanticType).toBe('CONSTRAINT');
    expect(ctx.effective.dietaryConstraints?.authority).toBe('CONSTRAINT');
    expect(ctx.effective.dietaryConstraints?.sourceScope).toBe('L1_PERSISTENT');
    expect(ctx.effective.pace?.authority).toBe('ADVISORY');
    expect(ctx.effective.dietaryConstraints?.sensitivity).toBe('SENSITIVE');
    expect(ctx.byDomain.FOOD?.length).toBeGreaterThan(0);
    expect(ctx.byDomain.PACE?.length).toBeGreaterThan(0);
    expect(ctx.provenance.osProfilePresent).toBe(true);
    expect(ctx.provenance.osTravelPreferenceKeys).toEqual(
      expect.arrayContaining(['mergedInterests', 'pacePreference']),
    );
  });

  it('lets TMR L2 paceOverride win over OS L1 pace', () => {
    const profile = {
      ...createDefaultUserTravelProfile('traveler_1'),
      pacePreference: 'SLOW' as const,
      confidence: 0.9,
      source: 'explicit' as const,
    };
    const assembled = {
      schemaId: 'tripnara.assembled_decision_context@v1',
      version: 1,
      task: 'trip',
      assembledAt: new Date().toISOString(),
      slices: [],
      memoryDecisionSafe: true,
      contract: {
        schemaId: 'tripnara.context_assembly_contract@v1',
        version: 1,
        task: 'trip',
        providers: ['MEMORY'],
        deny: [],
      },
      memory: {
        schemaId: 'tripnara.memory_context_package@v1',
        task: 'trip',
        builtAt: new Date().toISOString(),
        structured: {
          pace: {
            key: 'travel.pace',
            value: 'SLOW',
            confidence: 0.9,
            scope: 'GLOBAL_USER',
            status: 'ACTIVE',
            sourceType: 'USER_EXPLICIT',
            evidenceEventIds: ['M-L1'],
            validFrom: new Date().toISOString(),
            validTo: null,
            lastConfirmedAt: null,
          },
        },
        tripMemory: {
          tripId: 'trip_1',
          paceOverride: {
            key: 'travel.pace',
            value: 'FAST',
            confidence: 0.85,
            scope: 'TRIP',
            status: 'ACTIVE',
            sourceType: 'USER_EXPLICIT',
            evidenceEventIds: ['M-L2'],
            validFrom: new Date().toISOString(),
            validTo: null,
            lastConfirmedAt: null,
          },
        },
        relevantEpisodes: [],
        semanticEvidence: [],
        conflicts: [],
        missingMemory: [],
        contract: {
          schemaId: 'tripnara.memory_contract@v1',
          version: 1,
          task: 'trip',
          allow: ['PACE_PREFERENCE'],
          deny: [],
          includeUserProfileFields: ['pace'],
          includeTripMemory: true,
          includeWorking: false,
          maxEpisodes: 0,
          includeSemantic: false,
          needs: [],
          reason: 'test',
        },
        memoryContext: {
          facts: [],
          preferences: [],
          episodes: [],
          confidence: [],
          evidence: [],
          conflicts: [],
        },
        decisionSafe: true,
        designPrinciple: 'test',
      },
      decisionContract: null,
      selfDriveWorld: null,
      booking: null,
      team: null,
      shadowBaseline: { memoryOmitted: true, providersWithoutMemory: [] },
      mode: 'SHADOW',
    } as AssembledTravelContextV1;

    const ctx = resolveEffectiveTravelerContext({
      memory: baseMemory({ userProfile: profile }),
      assembledTravelContext: assembled,
    });

    expect(ctx.effective.pace?.value).toBe('FAST');
    expect(ctx.effective.pace?.layer).toBe('L2_TRIP_OVERRIDE');
    expect(ctx.tripOverridesApplied).toContain('pace');
    const l1Pace = ctx.items.find(
      (i) => i.key === 'pace' && i.layer === 'L1_PERSISTENT',
    );
    expect(l1Pace?.overriddenByKey).toBe('pace');
  });

  it('mirrors advisory hints without changing consumptionMode', () => {
    const ctx = resolveEffectiveTravelerContext({
      memory: baseMemory(),
      decisionHints: [
        {
          key: 'travel.pace',
          value: 'RELAXED',
          influence: 'PACE_CONSTRAINT',
          confidence: 0.9,
          memoryId: 'h1',
          advisoryOnly: true,
        },
      ],
    });
    expect(ctx.consumptionMode).toBe('SHADOW');
    expect(ctx.advisoryHints).toHaveLength(1);
    const obs = effectiveTravelerContextToObservability(ctx);
    expect(obs.advisoryHintCount).toBe(1);
    expect(obs.consumptionMode).toBe('SHADOW');
  });

  it('skips TMR CANDIDATE fields', () => {
    const assembled = {
      schemaId: 'tripnara.assembled_decision_context@v1',
      version: 1,
      task: 'trip',
      assembledAt: new Date().toISOString(),
      slices: [],
      memoryDecisionSafe: true,
      contract: {
        schemaId: 'tripnara.context_assembly_contract@v1',
        version: 1,
        task: 'trip',
        providers: ['MEMORY'],
        deny: [],
      },
      memory: {
        schemaId: 'tripnara.memory_context_package@v1',
        task: 'trip',
        builtAt: new Date().toISOString(),
        structured: {
          pace: {
            key: 'travel.pace',
            value: 'FAST',
            confidence: 0.4,
            scope: 'GLOBAL_USER',
            status: 'CANDIDATE',
            sourceType: 'DECISION_OUTCOME',
            evidenceEventIds: ['cand'],
            validFrom: new Date().toISOString(),
            validTo: null,
            lastConfirmedAt: null,
          },
        },
        tripMemory: null,
        relevantEpisodes: [],
        semanticEvidence: [],
        conflicts: [],
        missingMemory: [],
        contract: {
          schemaId: 'tripnara.memory_contract@v1',
          version: 1,
          task: 'trip',
          allow: ['PACE_PREFERENCE'],
          deny: [],
          includeUserProfileFields: ['pace'],
          includeTripMemory: false,
          includeWorking: false,
          maxEpisodes: 0,
          includeSemantic: false,
          needs: [],
          reason: 'test',
        },
        memoryContext: {
          facts: [],
          preferences: [],
          episodes: [],
          confidence: [],
          evidence: [],
          conflicts: [],
        },
        decisionSafe: true,
        designPrinciple: 'test',
      },
      decisionContract: null,
      selfDriveWorld: null,
      booking: null,
      team: null,
      shadowBaseline: { memoryOmitted: true, providersWithoutMemory: [] },
      mode: 'SHADOW',
    } as AssembledTravelContextV1;

    const ctx = resolveEffectiveTravelerContext({
      memory: baseMemory(),
      assembledTravelContext: assembled,
    });
    expect(ctx.effective.pace).toBeUndefined();
    expect(ctx.provenance.tmrStructuredKeys).toEqual([]);
  });
});
