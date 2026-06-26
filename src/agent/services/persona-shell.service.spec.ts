import { PersonaShellService } from './persona-shell.service';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import { attachCausalPersonaToPlanState } from '../../trips/causal-runtime/persona/build-causal-persona-projection';
import type { CausalPersonaProjection } from '../../trips/causal-runtime/persona/causal-persona-projection.types';
import { CAUSAL_PERSONA_PROJECTION_SCHEMA } from '../../trips/causal-runtime/persona/causal-persona-projection.types';

function minimalPlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    plan_id: 'plan-1',
    constraints: { budget: { total: 10000, currency: 'CNY' } },
    budget: { overrun: null as never },
    mobility: { transferSegments: [] },
    pace: { fatigueScore: null as never, timeWindows: [] },
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    metadata: {},
    ...overrides,
  } as PlanState;
}

describe('PersonaShellService', () => {
  const service = new PersonaShellService();

  it('exposes single-lead presentation on wrap', async () => {
    const result = await service.wrapAsPersonas(minimalPlanState());
    expect(result.presentation).toBeDefined();
    expect(result.presentation.mode).toBe('single_lead');
    expect(result.presentation.leadSpeaker).toBe('ABU');
    expect(result.presentation.narrative).toBeTruthy();
  });

  it('maps Neptune REPLACE to REPAIR action', async () => {
    const result = await service.wrapAsPersonas(
      minimalPlanState({
        gate: {
          status: 'SUGGEST_REPLACE',
          reasons: [],
          missingEvidence: [],
        },
        mobility: {
          transferSegments: [
            {
              from: { city: 'A' },
              to: { city: 'B' },
              feasibility: 'feasible',
              riskFlags: [{ severity: 'high', description: 'storm' }],
            },
          ],
        } as PlanState['mobility'],
      }),
    );
    expect(result.personas.neptune?.guardianAction).toBe('REPAIR');
    expect(result.presentation.leadSpeaker).toBe('NEPTUNE');
  });

  it('maps Abu REJECT to BLOCK', async () => {
    const result = await service.wrapAsPersonas(
      minimalPlanState({
        gate: {
          status: 'REJECT',
          reasons: ['F-road closed'],
          missingEvidence: [],
        },
      }),
    );
    expect(result.personas.abu?.guardianAction).toBe('BLOCK');
    expect(result.consolidatedDecision.status).toBe('REJECT');
  });

  it('uses in_trip brief style when trip is traveling', async () => {
    const result = await service.wrapAsPersonas(
      minimalPlanState({ metadata: { tripStatus: 'TRAVELING' } }),
    );
    expect(result.presentation.expressionPhase).toBe('in_trip');
    expect(result.presentation.displayStyle).toBe('execution_brief');
  });

  it('narrates from causal persona kernel when authoritative', async () => {
    const projection: CausalPersonaProjection = {
      schema: CAUSAL_PERSONA_PROJECTION_SCHEMA,
      kernelAuthoritative: true,
      abu: {
        persona: 'ABU',
        verdict: 'NEED_CONFIRM',
        explanation: '风速 18 m/s，错过概率 42%',
        causalChain: ['environment:wind_mps', 'outcome:miss_probability'],
        evidence: [{ source: '冰岛', excerpt: 'wind', relevance: 'wind' }],
        source: 'iceland_causal_module',
      },
      neptune: {
        persona: 'NEPTUNE',
        verdict: 'REPLACE',
        explanation: '建议提前 45 分钟出发',
        causalChain: ['intervention:SHIFT_TIME'],
        evidence: [],
        recommendations: [
          { action: '提前 45 分钟出发', reason: '风致延时', impact: '降低错过概率' },
        ],
        source: 'iceland_causal_module',
      },
    };
    const planState = minimalPlanState();
    attachCausalPersonaToPlanState(planState, projection);
    const result = await service.wrapAsPersonas(planState);
    expect(result.personas.abu?.explanation).toContain('18 m/s');
    expect(result.personas.neptune?.recommendations?.[0]?.action).toContain('45');
  });
});
