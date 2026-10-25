import { resolveBindingsForRisk } from './execution-risk-constraint-binding.defaults';
import { DEFAULT_RISK_CONSTRAINT_BINDINGS } from './execution-risk-constraint-binding.defaults';

describe('execution-risk-constraint-binding.defaults', () => {
  it('seeds cover wind / road / fatigue / daylight bridges', () => {
    const codes = new Set(DEFAULT_RISK_CONSTRAINT_BINDINGS.map((b) => b.knowledgeCode));
    expect(codes.has('ENV-WIND-01')).toBe(true);
    expect(codes.has('ROAD-CLOSE-01')).toBe(true);
    expect(codes.has('MEMBER-FATIGUE-DRIVER-01')).toBe(true);
    expect(codes.has('ENV-LIGHT-01')).toBe(true);
  });

  it('resolves STOP wind to official wind safety hard block', () => {
    const resolved = resolveBindingsForRisk({
      knowledgeCode: 'ENV-WIND-01',
      severityLevel: 'STOP',
      bindings: DEFAULT_RISK_CONSTRAINT_BINDINGS.map((b) => ({
        ...b,
        status: 'ACTIVE',
      })),
    });
    expect(resolved.primary?.constraintTemplateId).toBe('c_official_is_wind_safety');
    expect(resolved.anyBlocked).toBe(true);
  });

  it('matches any-level bindings when severityLevel is null on row', () => {
    const resolved = resolveBindingsForRisk({
      knowledgeCode: 'ENV-WIND-01',
      severityLevel: 'AT_RISK',
      bindings: [
        {
          id: 'x',
          knowledgeCode: 'ENV-WIND-01',
          severityLevel: null,
          status: 'ACTIVE',
          priority: 1,
          blocked: false,
          constraintTemplateId: 'c_world_feasibility',
          constraintCategory: 'WORLD_STATE',
          constraintType: 'SOFT',
          executionGate: 'AT_RISK',
          violationClass: 'SOFT',
          feasibilityDimension: 'environment',
          notesZh: 'any',
        },
      ],
    });
    expect(resolved.bindings).toHaveLength(1);
  });
});
