import {
  buildTripRunObservabilityMetadataPatch,
  buildTripRunObservabilityV1,
  resolveTripRunObservabilityFromStored,
  TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
} from './trip-run-observability.util';

describe('trip-run-observability.util', () => {
  const sampleResponse = {
    result: { status: 'OK' },
    explain: {
      decision_cockpit: {
        chosen_plan_id: 'route_a',
        verdict_narration_zh: '风险最低',
        decision_trace_rows: [
          {
            decision_stage: 'OPTIMIZATION',
            action: 'select_plan',
            explanation: '选择路线A',
            reason_codes: ['LOW_RISK'],
            evidence_refs: ['vedur:f-road'],
          },
        ],
      },
    },
    observability: {
      mode_final: 'CLAUDE_SM',
      agent_run_trace_v1: {
        final_delivery_status: 'OK',
        nodes: [
          { step: 'INTAKE', duration_ms: 12 },
          {
            step: 'weather_risk_check',
            duration_ms: 800,
            system_action: 'SafetyGuardian',
            evidence_refs: ['live_tool:mcp:hotel', 'vedur'],
          },
        ],
        hallucination_gate: { verdict: 'PASS' },
      },
      agent_turn_trace: {
        task_type: 'LIVE_EXECUTION',
        task: {
          taskType: 'LIVE_EXECUTION',
          userGoal: '规划冰岛5日自驾',
          constraintsDetected: ['不夜驾', '每天驾驶<=4小时'],
        },
        evidence_bucket: { verified: 1, stale: 0, assumed: 1, unavailable: 0 },
        evidence_facts: [
          {
            key: 'f_road',
            valueZh: '今天F路段关闭',
            freshness: 'VERIFIED',
            source: 'vedur/weather_api',
            observedAt: '2026-08-13',
          },
          {
            key: 'hotel',
            valueZh: '这个酒店有空房',
            freshness: 'ASSUMED',
            source: 'memory',
          },
        ],
        conclusion_strength: 'CONDITIONAL',
        capability_denied: ['用户驾驶经验'],
      },
      travel_memory_consume: {
        decisionHints: [
          {
            memoryId: 'L1_pref_001',
            key: 'travel.pace',
            value: 'relaxed',
            influence: 'RISK_PREFERENCE',
            confidence: 0.8,
            advisoryOnly: true,
          },
        ],
      },
      execution_timeline_preview: [
        {
          phase: 'planner',
          operation: 'extract_constraints',
          status: 'ok',
          actor: 'Planner',
          durationMs: 800,
        },
        {
          phase: 'safety',
          operation: 'weather_check',
          tool: 'vedur',
          status: 'ok',
          actor: 'SafetyGuardian',
          durationMs: 2300,
        },
      ],
      memory_decision_trace: {
        memoryContribution: {
          used: true,
          influence: [
            {
              memoryId: 'L1_pref_001',
              influence: 'RISK_PREFERENCE',
              weight: 0.3,
              confidence: 0.8,
            },
          ],
        },
      },
      live_sensor_audit: [{ tool_id: 'live_tool.mcp.hotel', ok: true, latency_ms: 40 }],
    },
    conversation_turn_result: {
      cards: [
        {
          kind: 'decision_options',
          options: [
            { id: 'a', labelZh: '路线A', score: 0.82, pros: ['稳'], cons: [] },
            { id: 'b', labelZh: '路线B', score: 0.74 },
          ],
        },
      ],
    },
  };

  it('builds P0 decision / evidence / steps / memory / tools', () => {
    const obs = buildTripRunObservabilityV1(sampleResponse);
    expect(obs?.schemaId).toBe(TRIP_RUN_OBSERVABILITY_SCHEMA_ID);
    expect(obs?.decisionTrace?.goalExtraction.userGoal).toContain('冰岛');
    expect(obs?.decisionTrace?.optionsGenerated).toHaveLength(2);
    expect(obs?.decisionTrace?.finalDecision.selected).toBe('route_a');
    expect(obs?.evidenceTrace?.bucket.verified).toBe(1);
    expect(obs?.evidenceTrace?.items[0].type).toBe('VERIFIED');
    expect(obs?.steps.length).toBe(2);
    expect(obs?.steps[1].tool).toBe('vedur');
    expect(obs?.memoryTrace?.used[0].memoryId).toBe('L1_pref_001');
    expect(obs?.memoryTrace?.used[0].content).toContain('travel.pace');
    expect(obs?.toolEvaluation?.[0].tool).toBe('live_tool.mcp.hotel');
    expect(obs?.toolEvaluation?.[0].changedDecision).toBe(true);
    expect(obs?.toolEvaluation?.[0].contributionScore).toBeGreaterThan(0.5);
    expect(obs?.qualityMetrics?.taskSuccess).toBe(true);
    expect(obs?.qualityMetrics?.evidenceCoverage).toBeGreaterThan(0);
    expect(obs?.qualityMetrics?.toolEfficiency).toBeGreaterThan(0);
    expect(obs?.qualityMetrics?.constraintCoverage).toBeGreaterThan(0);
    expect(obs?.decisionCompleteness).toBe('FULL');
    expect(obs?.failure).toBeNull();
    expect(obs?.feedback).toBeNull();
    expect(obs?.outcome).toBeNull();
    expect(obs?.benchmark).toBeNull();
  });

  it('marks PARTIAL when options are missing', () => {
    const obs = buildTripRunObservabilityV1({
      observability: {
        mode_final: 'CLAUDE_SM',
        agent_turn_trace: {
          task: { userGoal: '规划', constraintsDetected: ['不夜驾'], taskType: 'LIVE_EXECUTION' },
        },
        agent_run_trace_v1: { final_delivery_status: 'OK', nodes: [{ step: 'X' }] },
      },
      explain: { decision_cockpit: { chosen_plan_id: 'route_a', decision_trace_rows: [] } },
    });
    expect(obs?.decisionCompleteness).toBe('PARTIAL');
  });

  it('maps failure taxonomy from orchestrator_robustness', () => {
    const obs = buildTripRunObservabilityV1(
      { observability: { mode_final: 'CLAUDE_DYNAMIC' } },
      {
        robustness: {
          failure_domain: 'TIMEOUT',
          failure_code: 'ORCHESTRATION_TIMEOUT',
          source_layer: 'ORCHESTRATOR',
          retryable_hint: true,
          message_preview: 'TIMEOUT:CLAUDE_DYNAMIC',
          orchestrator_step_at_failure: 'OPTIMIZE',
        },
        status: 'FAILED',
      },
    );
    expect(obs?.failure).toMatchObject({
      category: 'EXECUTION_ERROR',
      type: 'ORCHESTRATION_TIMEOUT',
      recoverable: true,
      severity: 'HIGH',
    });
    expect(obs?.qualityMetrics?.taskSuccess).toBe(false);
  });

  it('writes metadata patch shortcuts', () => {
    const patch = buildTripRunObservabilityMetadataPatch(sampleResponse);
    expect(patch.observability_v1).toBeTruthy();
    expect(patch.decision_selected).toBe('route_a');
    expect(patch.step_count).toBe(2);
  });

  it('resolves stored observability_v1 preferentially', () => {
    const stored = buildTripRunObservabilityV1(sampleResponse)!;
    const resolved = resolveTripRunObservabilityFromStored({
      metadata: { observability_v1: stored },
      userQuery: 'ignored',
      status: 'COMPLETED',
    });
    expect(resolved?.decisionTrace?.finalDecision.selected).toBe('route_a');
  });

  it('accepts extras.benchmark for golden eval', () => {
    const obs = buildTripRunObservabilityV1(sampleResponse, {
      benchmark: {
        taskId: 'ICE-023',
        pass: false,
        score: 72,
        failedDimension: ['budget_constraint'],
      },
    });
    expect(obs?.benchmark).toEqual({
      taskId: 'ICE-023',
      pass: false,
      score: 72,
      failedDimension: ['budget_constraint'],
    });
  });
});
