import { buildHeuristicConstraintReports } from './constraint-reports.heuristic';
import { runMultiAgentNegotiation } from './negotiation.engine';
import type { ObjectiveVector } from '../pareto/objective-vector.types';

const full = (p: Partial<ObjectiveVector>): ObjectiveVector => ({
  satisfaction: p.satisfaction ?? 0.5,
  efficiency: p.efficiency ?? 0.5,
  cost: p.cost ?? 0.5,
  fatigue: p.fatigue ?? 0.5,
  experience: p.experience ?? 0.5,
  risk: p.risk ?? 0.5,
});

describe('runMultiAgentNegotiation', () => {
  it('filters blocking plans then picks utility among RELAXER', () => {
    const paretoPlans = [
      { planId: 'A', objectives: full({ fatigue: 0.95, risk: 0.15 }) },
      { planId: 'B', objectives: full({ fatigue: 0.4, risk: 0.9 }) },
    ];
    const reports = buildHeuristicConstraintReports(paretoPlans);
    const r = runMultiAgentNegotiation({
      paretoPlans,
      personaType: 'RELAXER',
      reports,
    });
    expect(r.selectedPlanId).toBe('B');
    expect(r.conflictResolutionLog.some((l) => l.planId === 'A')).toBe(true);
  });

  it('falls back when all blocking', () => {
    const paretoPlans = [
      { planId: 'X', objectives: full({ risk: 0.05, fatigue: 0.05 }) },
      { planId: 'Y', objectives: full({ risk: 0.08, fatigue: 0.06 }) },
    ];
    const reports = buildHeuristicConstraintReports(paretoPlans);
    const r = runMultiAgentNegotiation({
      paretoPlans,
      personaType: 'EFFICIENCY_HUNTER',
      reports,
    });
    expect(r.selectedPlanId).toBe('Y');
  });
});
