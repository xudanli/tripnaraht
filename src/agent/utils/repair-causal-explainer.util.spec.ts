import { formatPredictiveFailureReport, formatRepairDeadlockAudit } from './repair-causal-explainer.util';
import type { SimulatedRepairTrace } from '../services/route-feasibility.types';

describe('formatRepairDeadlockAudit', () => {
  it('formats a causal chain with constraint + tactic ids', () => {
    const out = formatRepairDeadlockAudit({
      moveCount: 3,
      itemId: 'poi-1',
      signatures: [
        { constraintId: 'time_space.max_driving_hours', tacticId: 'MigrateToNextDayTactic' },
        { constraintId: 'time_space.eta_feasibility', tacticId: 'ShiftTactic' },
        { constraintId: 'time_space.min_transfer_buffer', tacticId: 'TimeShrinkTactic' },
      ],
    });
    expect(out).toContain('逻辑死结审计');
    expect(out).toContain('3 次');
    expect(out).toContain('time_space.max_driving_hours');
    expect(out).toContain('MigrateToNextDayTactic');
    expect(out).toContain('结论');
  });

  it('formats predictive failure report from SimulatedRepairTrace objects', () => {
    const traces: SimulatedRepairTrace[] = [
      {
        tacticId: 'IntakePredictiveSimulator',
        targetEntity: { type: 'DAY', id: 'INTAKE' },
        applied: false,
        reason: 'FATIGUE_EXHAUSTION',
        metrics: {
          fatigue_score01: 0.82,
          fatigue_weight: 0,
          base_limit: 5,
          effective_limit: 5,
          actual_cost: 6.34,
          unit: 'h',
        },
        simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'fatigue_high_risk' },
        evidence: { refIds: ['proof:stub'] },
      },
    ];
    const out = formatPredictiveFailureReport(traces);
    expect(out).toContain('预判式失败审计');
    expect(out).toContain('PREDICTIVE_FAILURE_REPORT');
    expect(out).toContain('fatigue_high_risk');
  });
});

