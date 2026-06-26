import {
  buildCausalPersonaProjection,
  attachCausalPersonaToPlanState,
  readCausalPersonaFromPlanState,
} from './build-causal-persona-projection';
import type { IcelandSelfDriveCausalOutput } from '../domains/iceland-self-drive-causal.types';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import { CAUSAL_PERSONA_PROJECTION_SCHEMA } from './causal-persona-projection.types';

function minimalPlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    plan_id: 'plan-1',
    constraints: { budget: { total: 10000, currency: 'CNY' } },
    budget: { overrun: null as never },
    mobility: { transferSegments: [] },
    pace: { fatigueScore: null as never, timeWindows: [] },
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    metadata: { destination: 'IS' },
    ...overrides,
  } as PlanState;
}

const windyIceland: IcelandSelfDriveCausalOutput = {
  schema: 'tripnara/iceland-self-drive-causal/v1',
  input: {
    windMps: 18,
    baseDurationMinutes: 120,
    slackMinutes: 15,
    legLabel: 'Vík → Jökulsárlón',
  },
  travelTime: { p50Minutes: 130, p90Minutes: 155, meanMinutes: 135 },
  missProbability: 0.42,
  causalChain: [
    'environment:wind_mps',
    'physics:safe_speed_factor',
    'travel:duration_p90',
    'outcome:miss_probability',
  ],
  bindings: [
    {
      variable: 'environment:wind_mps',
      label: '风速',
      baseValue: 8,
      projectedValue: 18,
      unit: 'm/s',
    },
    {
      variable: 'outcome:miss_probability',
      label: '错过概率',
      baseValue: 0.08,
      projectedValue: 0.42,
      unit: 'ratio',
    },
  ],
  userFacingAssessment:
    '南岸强风会拉长行驶时间，按 P90 评估错过概率偏高。建议提前出发。',
  recommendedIntervention: {
    type: 'SHIFT_TIME',
    shiftMinutes: 45,
    rationale: '提前出发以吸收风致延时',
  },
};

describe('buildCausalPersonaProjection', () => {
  it('projects Abu / Dre / Neptune from Iceland assessment', () => {
    const projection = buildCausalPersonaProjection({
      planState: minimalPlanState(),
      icelandAssessment: windyIceland,
    });

    expect(projection?.schema).toBe(CAUSAL_PERSONA_PROJECTION_SCHEMA);
    expect(projection?.kernelAuthoritative).toBe(true);
    expect(projection?.abu?.verdict).toBe('NEED_CONFIRM');
    expect(projection?.abu?.explanation).toContain('18');
    expect(projection?.drdre?.verdict).toBe('ADJUST');
    expect(projection?.neptune?.verdict).toBe('REPLACE');
    expect(projection?.neptune?.recommendations?.[0]?.action).toContain('45');
  });

  it('attaches projection to planState metadata', () => {
    const planState = minimalPlanState();
    const projection = buildCausalPersonaProjection({
      planState,
      icelandAssessment: windyIceland,
    });
    attachCausalPersonaToPlanState(planState, projection);
    expect(readCausalPersonaFromPlanState(planState)?.abu?.persona).toBe('ABU');
  });

  it('maps gate REJECT to Abu REJECT slice', () => {
    const projection = buildCausalPersonaProjection({
      planState: minimalPlanState({
        gate: {
          status: 'REJECT',
          reasons: ['F-road closed'],
          missingEvidence: [],
        },
      }),
    });
    expect(projection?.abu?.verdict).toBe('REJECT');
    expect(projection?.kernelAuthoritative).toBe(true);
  });
});
