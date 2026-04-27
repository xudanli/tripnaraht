import { buildConflictStateGraph, evaluateGraphEfficiency } from './conflict-state-graph.util';

describe('ConflictStateGraph IR', () => {
  it('builds node+edges and escalates weight when action oscillation>=2', () => {
    const decision_log: any[] = [
      {
        request_id: 'r1',
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: '2026-01-01T00:00:00.000Z',
        metadata: {
          system_action: 'EARLY_WARNING',
          early_warning: { evidence_summary: 'F-road requires 4WD', risk_level: 'HIGH', conflict_type: 'REACHABILITY' },
        },
      },
      // reject top twice => oscillation escalated
      {
        request_id: 'r1',
        step: 'STATE_UPDATE',
        actor: 'Orchestrator',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: '2026-01-01T00:00:10.000Z',
        metadata: { system_action: 'CLARIFICATION_FEEDBACK', questionId: 'early_warning_relaxations', reward: 0, top_scored_value: 'upgrade_vehicle_to_4wd', chosen_actions: ['proceed_at_own_risk'] },
      },
      {
        request_id: 'r1',
        step: 'STATE_UPDATE',
        actor: 'Orchestrator',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: '2026-01-01T00:00:20.000Z',
        metadata: { system_action: 'CLARIFICATION_FEEDBACK', questionId: 'early_warning_relaxations', reward: 0, top_scored_value: 'upgrade_vehicle_to_4wd', chosen_actions: ['drop_one_must_include_poi'] },
      },
      // then convert
      {
        request_id: 'r1',
        step: 'STATE_UPDATE',
        actor: 'Orchestrator',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: '2026-01-01T00:00:30.000Z',
        metadata: { system_action: 'CLARIFICATION_FEEDBACK', questionId: 'early_warning_relaxations', reward: 1, top_scored_value: 'upgrade_vehicle_to_4wd', chosen_actions: ['upgrade_vehicle_to_4wd'] },
      },
    ];

    const audit_report: any = {
      behavioral_gap: { early_warning_id: 'ew1', wall_hit_distance: { latency_ms: 180000 } },
      persuasion_summary: { feedback_event_count: 3, positive_reward_count: 1, negative_reward_count: 0 },
    };

    const dm = { evidence_cards: [{ kind: 'iron_shield_evidence', rule_id: 'r1' }] };
    const g = buildConflictStateGraph({ session_id: 'r1', decision_log, audit_report, decision_metadata: dm });
    expect(g.summary.decision_metadata).toEqual(dm);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(3);
    expect(g.summary.oscillation_k_action.upgrade_vehicle_to_4wd).toBe(2);

    const escalated = g.edges.filter((e) => (e.tags ?? []).includes('OSCILLATION_ESCALATED'));
    expect(escalated.length).toBeGreaterThan(0);

    const evalOut = evaluateGraphEfficiency(g);
    expect(evalOut.has_conversion).toBe(true);
    expect(evalOut.persuasion_efficiency_score).toBeGreaterThan(0);
  });
});

