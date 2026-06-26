import {
  enrichPhysicalEvaluation,
  buildExperienceFulfillmentFromVerificationReport,
} from './services/experience-fulfillment.orchestrator';
import {
  extractPreserveGoalsFromState,
  findViolatedMustPreserveGoals,
  buildPreserveViolationFatalMessage,
  itemMatchesPreserveGoal,
} from './utils/repair-preserve-guard.util';
import { validateDraftLlmSlotsAsCandidates } from './utils/draft-slot-candidate.util';
import type { VerificationReport } from '../../decision/kernel/decision-state.types';
import type { PhysicalEvaluationResult } from '../../domain/ontology/validator/physical-validator.types';

describe('experience-fulfillment Round 3 integration', () => {
  it('enriches physical evaluation with repair contract for F-road + 2WD', () => {
    const physical: PhysicalEvaluationResult = {
      validator_version: 'physical@1',
      rule_bundle_id: 'iceland-f-road',
      evaluated_at: '2026-07-01T12:00:00Z',
      blocking: true,
      violations: [
        {
          code: 'TERRAIN_F_ROAD_UNFIT',
          severity: 'BLOCK',
          detail: '2WD cannot access F-road segment',
          evidence_source: 'policy:iceland-f-road',
        },
      ],
    };

    const enriched = enrichPhysicalEvaluation(physical, {
      userMessage: '2WD 世界尽头感 高地日落',
      partialParams: { vehicleType: '2WD' },
      scope: 'CANDIDATE',
    });

    expect(enriched.experience_fulfillment?.verificationResult?.status).toBe('REPAIR_REQUIRED');
    expect(enriched.experience_fulfillment?.repairContract?.preserveGoals.length).toBeGreaterThan(0);
    expect(enriched.experience_fulfillment?.repairContract?.replacementSearchSpace.vehicleAccess).toEqual(['2WD']);
  });

  it('maps kernel verification report to experience fulfillment state', () => {
    const report: VerificationReport = {
      issues: [
        {
          code: 'TERRAIN_F_ROAD_UNFIT',
          class: 'CONFLICT',
          message: 'F-road incompatible',
          source: 'ROUTE_FEASIBILITY',
          at: '2026-07-01T12:00:00Z',
        },
      ],
      hasFatal: false,
      hasConflict: true,
      hasAdvisory: false,
      counts: { fatal: 0, conflict: 1, advisory: 0 },
      verifiedAt: '2026-07-01T12:00:00Z',
    };

    const state = buildExperienceFulfillmentFromVerificationReport(report, {
      userMessage: '必须冰川徒步',
    });
    expect(state.verificationResult?.status).toBe('REPAIR_REQUIRED');
    expect(state.repairContract?.preserveGoals.some((g) => g.intent === 'GLACIER_ADVENTURE')).toBe(true);
  });

  it('blocks repair removal when item matches MUST_PRESERVE glacier goal', () => {
    const goals = extractPreserveGoalsFromState({
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'r1', currentPhase: 'REPAIR', lastUpdatedAt: 't' },
      experienceFulfillment: {
        revision: 'v1',
        experienceIntent: {
          revision: 'v1',
          experienceIntents: [
            { atom: 'GLACIER_ADVENTURE', weight: 0.9, priority: 'MUST_PRESERVE' },
          ],
          negativePreferences: [],
        },
      },
    });
    const item = { name: '冰川徒步体验', metadata: { experience_atoms: ['GLACIER_ADVENTURE'] } };
    const violated = findViolatedMustPreserveGoals(item, goals);
    expect(violated.length).toBe(1);
    expect(buildPreserveViolationFatalMessage(violated)).toContain('GLACIER_ADVENTURE');
    expect(itemMatchesPreserveGoal(item, goals[0])).toBe(true);
  });

  it('validates draft LLM slots as experience candidates', () => {
    const candidates = [
      {
        id: 101,
        nameCN: '黑沙滩',
        type: 'attraction',
        category: 'VIEWPOINT',
        lat: 63.4,
        lng: -19.0,
        avgVisitDuration: 45,
      },
    ] as any[];
    const parsed = {
      days: [
        {
          day: 1,
          slots: {
            morning: { placeId: 101, reason: '世界尽头感海岸' },
          },
        },
      ],
    };
    const result = validateDraftLlmSlotsAsCandidates(
      parsed,
      candidates,
      { destination: 'IS', travelStyle: 'nature', intensity: 'relaxed' } as any,
      [{ day: 1, date: '2026-07-10' }],
    );
    expect(result.valid).toBe(true);
    expect(result.candidates.length).toBe(1);
  });
});
