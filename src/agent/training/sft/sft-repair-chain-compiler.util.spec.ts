import { compileSftRepairChains, isRepairChainCandidate } from './sft-repair-chain-compiler.util';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';
import type { DecisionTrajectoryETLRow } from '../interfaces/decision-trajectory-etl.types';

const repairRow: DecisionTrajectoryETLRow = {
  id: 'id-repair',
  requestId: 'req-repair',
  tripId: null,
  status: 'FINALIZED',
  totalReward: 0.5,
  orchestrationOutcome: 'CONDITIONAL_REPAIR',
  rewardSignals: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  payload: {
    schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
    request_id: 'req-repair',
    input_context: { hard_constraints: [] },
    axiom_gate: {
      gate_result: 'ADJUST_REQUIRED',
      violations: [{ type: 'FEASIBILITY', severity: 'SOFT', detail: 'twilight buffer' }],
      triggered_axiom_ids: ['AX_TWILIGHT'],
    },
    orchestration_steps: [
      { step: 'VERIFY', status: 'FAILED', timestamp_ms: 1 },
      { step: 'REPAIR', status: 'COMPLETED', timestamp_ms: 2 },
    ],
    final_output: {
      itinerary: { days: [{ day_index: 1, items: [{ name: 'Fixed plan' }] }] } as any,
    },
  },
};

describe('sft-repair-chain-compiler', () => {
  it('detects repair chain candidates', () => {
    expect(isRepairChainCandidate(repairRow)).toBe(true);
  });

  it('emits alpaca and sharegpt records with thought chain', () => {
    const records = compileSftRepairChains(repairRow);
    expect(records).toHaveLength(2);
    const alpaca = records.find((r) => r.format === 'alpaca')!;
    expect(alpaca.instruction).toContain('修复');
    expect(alpaca.input).toContain('AX_TWILIGHT');
    expect(alpaca.output).toContain('Fixed plan');
    expect(alpaca.output).toContain('VERIFY');
    const sharegpt = records.find((r) => r.format === 'sharegpt')!;
    expect(sharegpt.conversations?.length).toBe(3);
  });
});
