import { extractNarratorDatasetFromRun, toJsonl, toJsonlV1 } from './narrator-dataset-extractor.util';

describe('NarratorDatasetExtractor', () => {
  it('emits authoritative completion when N>3 and includes cost_saved', () => {
    const rows = extractNarratorDatasetFromRun({
      request_id: 'r1',
      audit_report: {
        interaction_trace: { consecutive_same_relaxation_attempts: 2 },
        behavioral_gap: { wall_hit_distance: { latency_ms: 180_000 }, is_gold_sample: true, early_warning_id: 'ew1' } as any,
        persuasion_summary: { feedback_event_count: 1, positive_reward_count: 1, negative_reward_count: 0 } as any,
      } as any,
      decision_log: [
        {
          request_id: 'r1',
          step: 'RESEARCH',
          actor: 'Orchestrator',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'EARLY_WARNING',
            early_warning: {
              evidence_summary: 'F-road requires 4WD',
              historical_precedents: [{ stats: { historical_late_accept_rate: 0.95 } }],
            },
          },
        } as any,
        {
          request_id: 'r1',
          step: 'STATE_UPDATE',
          actor: 'Orchestrator',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'CLARIFICATION_FEEDBACK',
            questionId: 'early_warning_relaxations',
            reward: 1,
            early_warning_id: 'ew1',
            options_snapshot: [
              {
                value: 'upgrade_vehicle_to_4wd',
                label: '【路径 A·推荐】升级为 4WD',
                metadata: { score: 9, dominant_cid: 'REACHABILITY_HARD', precedent_n: 15 },
              },
            ],
          },
        } as any,
      ] as any,
      min_shown_count: 3,
    });

    expect(rows.length).toBeGreaterThan(0);
    const pos = rows.find((r) => r.metadata.label === 'POSITIVE_CHOSEN_TOP');
    expect(pos?.chosen).toContain('95%');
    expect(pos?.chosen).toContain('180000');

    const jsonl = toJsonl(rows);
    expect(jsonl).toContain('"prompt"');
    expect(jsonl.endsWith('\n')).toBe(true);

    const v1 = toJsonlV1(rows);
    expect(v1).toContain('"wall_hit_distance":"180s (Moderate)"');
    expect(v1).toContain('"regret_severity":"Moderate"');
    expect(v1).toContain('RegretSeverity: Moderate');
    // high oscillation (>=2) should inject strong sentence fingerprint
    expect(v1).toContain('物理规则不可逾越');
  });
});

