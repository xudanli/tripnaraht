/**
 * Simulated_to_Real_Join：INTAKE 仿真 reason 与 REPAIR 真实 trace 对齐 + 效用预测误差（审计层）。
 */
import { AuditReportGenerator } from './terminal-audit-report.generator';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { SimulatedRepairTrace } from '../services/route-feasibility.types';

describe('AuditReportGenerator — Simulated_to_Real_Join', () => {
  const rid = 'join-test-1';

  const simFatigue: SimulatedRepairTrace = {
    tacticId: 'IntakePredictiveSimulator',
    targetEntity: { type: 'DAY', id: 'INTAKE' },
    applied: false,
    reason: 'FATIGUE_EXHAUSTION',
    metrics: {
      fatigue_score01: 0.82,
      fatigue_weight: 0.5,
      base_limit: 5,
      effective_limit: 5,
      actual_cost: 6,
      unit: 'h',
      utility_delta: -0.85,
    },
    estimated_utility_delta: -0.85,
    simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'fatigue_high_risk' },
  };

  const realFatigue = {
    tacticId: 'TerrainRerouteTactic',
    targetEntity: { type: 'DAY', id: 'D1' },
    applied: true,
    reason: 'FATIGUE_EXHAUSTION' as const,
    metrics: {
      fatigue_weight: 1,
      base_limit: 5,
      effective_limit: 5,
      actual_cost: 6,
      unit: 'h',
      utility_delta: -0.85,
    },
  };

  const simFatigueOverload: SimulatedRepairTrace = {
    tacticId: 'IntakePredictiveSimulator',
    targetEntity: { type: 'DAY', id: 'INTAKE' },
    applied: false,
    reason: 'FATIGUE_OVERLOAD' as any,
    metrics: {
      fatigue_score01: 0.9,
      fatigue_weight: 0,
      base_limit: 8,
      effective_limit: 8,
      actual_cost: 12,
      unit: 'h',
      utility_delta: -25,
    },
    estimated_utility_delta: -25,
    simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'fatigue_overload_intent' },
  };

  const realFatigueOverload = {
    tacticId: 'FatigueOverloadProjection',
    targetEntity: { type: 'DAY', id: 'INTAKE' },
    applied: false,
    reason: 'FATIGUE_OVERLOAD' as const,
    metrics: {
      fatigue_weight: 0,
      base_limit: 8,
      effective_limit: 8,
      actual_cost: 12,
      unit: 'h',
      utility_delta: -25,
    },
  };

  const simEtaInfeasible: SimulatedRepairTrace = {
    tacticId: 'IntakePredictiveSimulator',
    targetEntity: { type: 'DAY', id: 'INTAKE' },
    applied: false,
    reason: 'ETA_INFEASIBLE' as any,
    metrics: {
      fatigue_score01: 0,
      fatigue_weight: 1,
      base_limit: 0,
      effective_limit: 0,
      actual_cost: 1,
      unit: 'bool',
      utility_delta: -20,
    } as any,
    estimated_utility_delta: -20,
    simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'eta_infeasible_intent' },
  };

  const realEtaInfeasible = {
    tacticId: 'EtaInfeasibleProjection',
    targetEntity: { type: 'DAY', id: 'INTAKE' },
    applied: false,
    reason: 'ETA_INFEASIBLE' as const,
    metrics: {
      fatigue_weight: 1,
      base_limit: 0,
      effective_limit: 0,
      actual_cost: 1,
      unit: 'bool',
      utility_delta: -20,
    } as any,
  };

  it('predictive_to_real_conflict_ratio=1 且 utility_prediction_error=0（reason 与 utility 对齐）', () => {
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      verification: {
        issues: [],
        hasFatal: false,
        hasConflict: false,
        hasAdvisory: false,
        counts: { fatal: 0, conflict: 0, advisory: 0 },
        verifiedAt: new Date().toISOString(),
        escalationPlan: {
          type: 'PHYSICAL_LIMIT_REACHED',
          reason: 'UTILITY_COMPENSATION_THRESHOLD',
          userClarificationSnippet: 'x',
          at: new Date().toISOString(),
          correlationId: 'corr-repair-b',
        },
      },
      systemState: {
        requestId: rid,
        repairTraces: [realFatigue as any],
        repairTraceHistory: [],
        userRepairResolutionLog: [
          {
            correlationId: 'corr-intake-a',
            resolution: 'PROCEED_REGARDLESS',
            recordedAt: '2026-04-23T12:00:00.000Z',
            feedbackPhase: 'INTAKE',
          },
        ],
      },
    };

    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
        early_warning: {
          predictive_failure_report: {
            card_type: 'PREDICTIVE_FAILURE_REPORT',
            correlationId: 'corr-intake-a',
            audit_text: 'test',
            simulated_repair_traces: [simFatigue],
          },
        },
      },
    };

    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    const s = report.predictive_failure_report_summary!;
    expect(s.predictive_simulated_conflict_count).toBe(1);
    expect(s.predictive_real_conflict_hits).toBe(1);
    expect(s.predictive_to_real_conflict_ratio).toBe(1);
    expect(s.utility_prediction_error).toBe(0);
    expect(report.user_repair_resolution_tail?.[0]?.resolution).toBe('PROCEED_REGARDLESS');
    expect(report.user_repair_resolution_tail?.[0]?.feedbackPhase).toBe('INTAKE');

    const link = report.predictive_feedback_then_repair!;
    expect(link.prediction_id).toBe('corr-intake-a');
    expect(link.real_repair_id).toBe('corr-repair-b');
    expect(link.intent_revision_flag).toBe(false);
    expect(link.drift_vector?.delta_reason).toBe('aligned');
    expect(link.drift_vector?.delta_utility).toBeCloseTo(0, 5);
    expect(report.session_consistency_score).toBe(100);
  });

  it('reason 不匹配时 ratio=0；utility 偏差体现在 utility_prediction_error', () => {
    const simOther: SimulatedRepairTrace = {
      ...simFatigue,
      reason: 'OSCILLATION_PREVENTION',
      metrics: { ...simFatigue.metrics, utility_delta: -20 },
      estimated_utility_delta: -20,
    };
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      systemState: {
        requestId: rid,
        repairTraces: [realFatigue as any],
        repairTraceHistory: [],
      },
    };
    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
        early_warning: {
          predictive_failure_report: {
            card_type: 'PREDICTIVE_FAILURE_REPORT',
            audit_text: 'x',
            simulated_repair_traces: [simOther],
          },
        },
      },
    };
    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    const s = report.predictive_failure_report_summary!;
    expect(s.predictive_to_real_conflict_ratio).toBe(0);
    expect(s.predictive_real_conflict_hits).toBe(0);
    expect(s.utility_prediction_error).toBeGreaterThan(0);
    const link = report.predictive_feedback_then_repair!;
    expect(link.drift_vector?.delta_reason.startsWith('sim:')).toBe(true);
    expect(report.session_consistency_score).toBe(25);
  });

  it('intent_revision_flag：先知日志后出现 RELAXATION_APPLIED 时为 true', () => {
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      systemState: { requestId: rid, repairTraces: [], repairTraceHistory: [] },
    };
    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [
        {
          request_id: rid,
          step: 'RESEARCH',
          actor: 'Orchestrator',
          inputs_summary: 'x',
          outputs_summary: 'y',
          evidence_refs: [],
          timestamp: '2026-04-23T10:00:00.000Z',
          metadata: { system_action: 'PREDICTIVE_FAILURE_REPORT' },
        },
        {
          request_id: rid,
          step: 'STATE_UPDATE',
          actor: 'Orchestrator',
          inputs_summary: 'relax',
          outputs_summary: 'z',
          evidence_refs: [],
          timestamp: '2026-04-23T10:01:00.000Z',
          metadata: { system_action: 'RELAXATION_APPLIED' },
        },
      ],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
        early_warning: {
          predictive_failure_report: {
            card_type: 'PREDICTIVE_FAILURE_REPORT',
            correlationId: 'p1',
            audit_text: 'a',
            simulated_repair_traces: [simFatigue],
          },
        },
      },
    };
    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    expect(report.predictive_feedback_then_repair?.intent_revision_flag).toBe(true);
    expect(report.session_consistency_score).toBe(45);
  });

  it('无先知卡时仍输出核心审计字段（hard contract）', () => {
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      verification: {
        issues: [],
      } as any,
      systemState: {
        requestId: rid,
        repairTraces: [],
        repairTraceHistory: [],
      },
    };
    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
      } as any,
    };

    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    expect(report.predictive_feedback_then_repair).toBeDefined();
    expect(report.predictive_feedback_then_repair.drift_vector.delta_reason).toBe('unknown');
    expect(report.predictive_feedback_then_repair.drift_vector.delta_utility).toBe(0);
    expect(typeof report.session_consistency_score).toBe('number');
    expect(report.session_consistency_score).toBe(0);
    expect(report.dominant_cid).toBe('unknown.unattributed');
  });

  it('axiom: FATIGUE_OVERLOAD — sim=real, dominant_cid=human.fatigue_capacity, score>=95', () => {
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      verification: {
        issues: [
          {
            class: 'CONFLICT',
            message:
              `[L3-PROOF|human.fatigue_capacity|DAY:INTAKE|cmp:LEQ|actual:12|limit:8|unit:h|slack:-4|evidence:MODEL:intent_fatigue] fatigue overload`,
          } as any,
        ],
      } as any,
      systemState: {
        requestId: rid,
        repairTraces: [realFatigueOverload as any],
        repairTraceHistory: [],
      },
    };

    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
        early_warning: {
          predictive_failure_report: {
            card_type: 'PREDICTIVE_FAILURE_REPORT',
            correlationId: 'corr-intake-fatigue',
            audit_text: 'test',
            simulated_repair_traces: [simFatigueOverload],
          },
        },
      },
    };

    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    expect(report.predictive_feedback_then_repair?.drift_vector?.delta_reason).toBe('aligned');
    expect(report.session_consistency_score).toBeGreaterThanOrEqual(95);
    expect((report as any).dominant_cid).toBe('human.fatigue_capacity');
  });

  it('axiom: ETA_INFEASIBLE — sim=real, dominant_cid=time.eta_feasibility, score>=95', () => {
    const decisionState: Partial<DecisionState> = {
      requestId: rid,
      verification: {
        issues: [
          {
            class: 'CONFLICT',
            message:
              `[L3-PROOF|time.eta_feasibility|DAY:INTAKE|cmp:LEQ|actual:1|limit:0|unit:bool|slack:-1|evidence:MODEL:intent_eta] eta infeasible`,
          } as any,
        ],
      } as any,
      systemState: {
        requestId: rid,
        repairTraces: [realEtaInfeasible as any],
        repairTraceHistory: [],
      },
    };

    const state: Partial<OrchestratorState> = {
      request_id: rid,
      decision_log: [],
      metadata: {
        started_at: '2026-04-23T00:00:00.000Z',
        last_updated_at: '2026-04-23T12:00:00.000Z',
        early_warning: {
          predictive_failure_report: {
            card_type: 'PREDICTIVE_FAILURE_REPORT',
            correlationId: 'corr-intake-eta',
            audit_text: 'test',
            simulated_repair_traces: [simEtaInfeasible],
          },
        },
      },
    };

    const report = AuditReportGenerator.generate(decisionState as DecisionState, state as OrchestratorState);
    expect(report.predictive_feedback_then_repair?.drift_vector?.delta_reason).toBe('aligned');
    expect(report.session_consistency_score).toBeGreaterThanOrEqual(95);
    expect((report as any).dominant_cid).toBe('time.eta_feasibility');
  });
});
