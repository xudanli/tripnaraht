import {
  admitFutureSimulation,
  admitPlanWrite,
  admitProblemFocus,
  admitRelationsDiscovery,
  attachRelationAndFocusCognition,
  attachRealityCognition,
  attachFutureSimulationCognition,
  buildCognitionClientEcho,
  buildFocusedDecisionProblemFromDecisionState,
  buildRelationGraphFromDecisionState,
  authorizeDecisionFromUserConfirmation,
  canAuthorizeDecisionPresentation,
  detectUserDecisionAuthorization,
  gatePlanWriteAdmission,
  markDecisionAuthorized,
  markOutcomeReconciled,
  markPlanApplied,
  resolveDecisionDepth,
  shouldRunPlanVerifyEngineering,
} from './decision-cognition.util';
import type { DecisionState } from './decision-state.types';

function minimalDso(over: Partial<DecisionState> = {}): DecisionState {
  return {
    requestId: 'r1',
    userIntent: { destination: 'IS', gaps: [] },
    tripState: { planDraft: { days: [] }, planVersion: 1 },
    environmentState: {},
    systemState: {
      requestId: 'r1',
      currentPhase: 'CONTEXT_BUILD',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastUpdatedAt: new Date().toISOString(),
    },
    worldStateSummary: {
      physical: { roadStates: { ring1: 'ok' } },
      human: { fitnessLevel: 'medium' },
    },
    research_data: { weather: { wind: 'strong' } },
    confidence: 0.8,
    ...over,
  } as DecisionState;
}

describe('decision-cognition.util', () => {
  it('builds RealitySnapshot and marks REALITY_READY', () => {
    const out = attachRealityCognition(minimalDso());
    expect(out.cognition?.realitySnapshot?.schema).toBe(
      'tripnara/decision-reality-snapshot@v1',
    );
    expect(out.cognition?.realitySnapshot?.tripState.destination).toBe('IS');
    expect(out.cognition?.markers).toContain('REALITY_READY');
    expect(admitRelationsDiscovery(out.cognition).ok).toBe(true);
  });

  it('builds RelationGraph and FocusedDecisionProblem from hard violations', () => {
    const dso = minimalDso({
      constraints: {
        feasible: false,
        gateOutcome: 'ADJUST_REQUIRED',
        violations: [
          {
            type: 'WIND_EXPOSURE',
            severity: 'HARD',
            detail: '高风暴露路段导致下午活动窗口不足',
          },
          {
            type: 'LUNCH_COMPRESSED',
            severity: 'SOFT',
            detail: '午餐时间被压缩',
          },
        ],
      },
    });
    const withFocus = attachRelationAndFocusCognition(dso);
    expect(withFocus.cognition?.relationGraph?.impactChains.length).toBeGreaterThan(0);
    expect(withFocus.cognition?.focusedProblem?.type).toBe('INFEASIBILITY');
    expect(withFocus.cognition?.focusedProblem?.suppressedSecondaryProblems).toEqual(
      expect.arrayContaining(['午餐时间被压缩']),
    );
    expect(withFocus.cognition?.focusedProblem?.gateDisposition).toBe('SUGGEST_REPLACE');
    expect(withFocus.cognition?.focusedProblem?.constraintLayer).toBe('SUGGEST_REPLACE');
    expect(admitProblemFocus(withFocus.cognition).ok).toBe(true);
  });

  it('echo includes four_layer and future requiresConfirmation', () => {
    let dso = attachRelationAndFocusCognition(
      minimalDso({
        constraints: {
          feasible: false,
          gateOutcome: 'NEED_USER_CONFIRM',
          violations: [
            { type: 'WIND_EXPOSURE', severity: 'HARD', detail: '高风' },
          ],
        },
        verification: {
          issues: [{ class: 'CONFLICT', code: 'WIND', message: '需确认' }],
          hasFatal: false,
          hasConflict: true,
          hasAdvisory: false,
          counts: { fatal: 0, conflict: 1, advisory: 0 },
          verifiedAt: new Date().toISOString(),
        } as any,
        environmentState: { actionDeadline: '2026-08-03T20:00:00.000Z' },
      }),
    );
    dso = attachFutureSimulationCognition(dso);
    const echo = buildCognitionClientEcho(dso.cognition);
    expect(echo?.four_layer?.schema).toBe('tripnara/cognition_four_layer@v1');
    expect(echo?.focused_problem?.constraintLayer).toBe('MUST_CONFIRM');
    expect(echo?.future?.requiresConfirmation).toBe(true);
    expect(echo?.four_layer?.focus.actionDeadline).toBeTruthy();
    expect(dso.cognition?.futureSimulation?.predictionWindow?.interventionDeadline).toBeTruthy();
  });

  it('builds FutureSimulationBundle after verify-like state', () => {
    const dso = attachRelationAndFocusCognition(
      minimalDso({
        constraints: { feasible: true, violations: [], gateOutcome: 'ALLOW' },
        verification: {
          issues: [],
          hasFatal: false,
          hasConflict: false,
          hasAdvisory: false,
          counts: { fatal: 0, conflict: 0, advisory: 0 },
          verifiedAt: new Date().toISOString(),
        } as any,
      }),
    );
    const withFuture = attachFutureSimulationCognition(dso);
    expect(withFuture.cognition?.futureSimulation?.verification.status).toBe('PASS');
    expect(withFuture.cognition?.markers).toContain('FUTURE_SIMULATED');
    expect(admitFutureSimulation(withFuture.cognition).ok).toBe(true);
  });

  it('resolveDecisionDepth maps light tasks to REALITY_ONLY', () => {
    expect(
      resolveDecisionDepth({
        routingTaskType: 'DATA_LOOKUP',
        orchestrateMode: 'LIGHTWEIGHT',
      }),
    ).toBe('REALITY_ONLY');
    expect(
      resolveDecisionDepth({
        routingTaskType: 'TRIP_PLANNING',
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        message: '明天强风，怎么调整南岸行程？',
      }),
    ).toBe('FOCUSED_DECISION');
    expect(
      resolveDecisionDepth({
        routingTaskType: 'TRIP_PLANNING',
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        message: '帮我规划冰岛7日行程',
      }),
    ).toBe('FULL_SIMULATION');
  });

  it('relation graph converges world + constraint edges without LLM', () => {
    const g = buildRelationGraphFromDecisionState(
      minimalDso({
        constraints: {
          feasible: false,
          violations: [{ type: 'X', severity: 'HARD', detail: 'blocked' }],
        },
      }),
    );
    expect(g.nodes.some((n) => n.id === 'entity:world_physical')).toBe(true);
    expect(g.edges.some((e) => e.relation === 'CONFLICTS_WITH')).toBe(true);
    const focus = buildFocusedDecisionProblemFromDecisionState(
      minimalDso({
        constraints: {
          feasible: false,
          violations: [{ type: 'X', severity: 'HARD', detail: 'blocked' }],
        },
      }),
      g,
    );
    expect(focus?.question).toContain('blocked');
  });

  it('enrichment prefers predictive failure as focused root cause', () => {
    const dso = minimalDso({
      tripState: { planDraft: { days: [] }, planVersion: 1, fatigue: 0.8 },
      optimizationHints: { fatigueTrend: 'HIGH' },
      constraints: {
        feasible: false,
        gateOutcome: 'ADJUST_REQUIRED',
        violations: [
          { type: 'TIME_WINDOW', severity: 'HARD', detail: '下午活动赶不上' },
        ],
      },
    });
    const withFocus = attachRelationAndFocusCognition(dso, {
      enrichment: {
        earlyWarning: {
          risk_level: 'HIGH',
          conflict_type: 'WEATHER',
          evidence_summary: 'strong wind corridor',
          predictive_failure_report: {
            audit_text: '强风 → 高车身不稳 → 驾驶超时 → 下午窗口失败',
            simulated_repair_traces: [{}],
          },
        },
        dominantAxiomCid: 'CID_WIND_EXPOSURE',
      },
      decisionDepth: 'FULL_SIMULATION',
    });
    expect(withFocus.cognition?.relationGraph?.nodes.some((n) => n.kind === 'axiom')).toBe(true);
    expect(withFocus.cognition?.relationGraph?.nodes.some((n) => n.id === 'entity:fatigue')).toBe(
      true,
    );
    expect(withFocus.cognition?.focusedProblem?.problemId).toContain('predictive');
    expect(withFocus.cognition?.focusedProblem?.suppressedSecondaryProblems).toEqual(
      expect.arrayContaining(['下午活动赶不上']),
    );
  });

  it('REALITY_AND_RELATIONS skips problem focus and future simulation', () => {
    const dso = attachRealityCognition(minimalDso(), { decisionDepth: 'REALITY_AND_RELATIONS' });
    const withRel = attachRelationAndFocusCognition(dso, {
      decisionDepth: 'REALITY_AND_RELATIONS',
    });
    expect(withRel.cognition?.relationGraph).toBeDefined();
    expect(withRel.cognition?.focusedProblem).toBeUndefined();
    const withFuture = attachFutureSimulationCognition(withRel, {
      decisionDepth: 'REALITY_AND_RELATIONS',
    });
    expect(withFuture.cognition?.futureSimulation).toBeUndefined();
    expect(withFuture.cognition?.decisionDepth).toBe('REALITY_AND_RELATIONS');
  });

  it('shouldRunPlanVerifyEngineering is false for shallow depths', () => {
    expect(shouldRunPlanVerifyEngineering('REALITY_ONLY')).toBe(false);
    expect(shouldRunPlanVerifyEngineering('REALITY_AND_RELATIONS')).toBe(false);
    expect(shouldRunPlanVerifyEngineering('FOCUSED_DECISION')).toBe(true);
    expect(shouldRunPlanVerifyEngineering('FULL_SIMULATION')).toBe(true);
  });

  it('shouldRunPlanVerifyEngineering forces true for SM planning entries even if depth stale', () => {
    expect(
      shouldRunPlanVerifyEngineering('REALITY_ONLY', {
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        smEntry: 'bound_trip_itinerary_adjust',
      }),
    ).toBe(true);
    expect(
      shouldRunPlanVerifyEngineering('REALITY_AND_RELATIONS', {
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        smEntry: 'new_trip_with_country',
      }),
    ).toBe(true);
  });

  it('authorize / apply / reconcile markers and client echo', () => {
    let dso = attachRelationAndFocusCognition(
      attachRealityCognition(minimalDso(), { decisionDepth: 'FULL_SIMULATION' }),
      {
        decisionDepth: 'FULL_SIMULATION',
        enrichment: undefined,
      },
    );
    dso = {
      ...dso,
      constraints: { feasible: true, violations: [], gateOutcome: 'ALLOW' },
    };
    expect(canAuthorizeDecisionPresentation(dso)).toBe(true);
    dso = markDecisionAuthorized(dso);
    dso = markPlanApplied(dso);
    dso = markOutcomeReconciled(dso);
    expect(dso.cognition?.markers).toEqual(
      expect.arrayContaining([
        'REALITY_READY',
        'DECISION_AUTHORIZED',
        'PLAN_APPLIED',
        'OUTCOME_RECONCILED',
      ]),
    );
    const echo = buildCognitionClientEcho(dso.cognition);
    expect(echo?.schema).toBe('tripnara/cognition_echo@v1');
    expect(echo?.decision_depth).toBe('FULL_SIMULATION');
    expect(echo?.reality?.snapshotId).toBeTruthy();
  });

  it('admitRelationsDiscovery tolerates marked blocking unknowns', () => {
    const out = attachRealityCognition(
      minimalDso({ userIntent: { destination: undefined, gaps: [] } as any }),
    );
    expect(out.cognition?.realitySnapshot?.unknowns.some((u) => u.blocking)).toBe(true);
    expect(admitRelationsDiscovery(out.cognition).ok).toBe(true);
  });

  it('admitPlanWrite requires authorize + future + planVersion', () => {
    let dso = attachFutureSimulationCognition(
      attachRelationAndFocusCognition(
        attachRealityCognition(
          minimalDso({
            constraints: { feasible: true, violations: [], gateOutcome: 'ALLOW' },
            verification: {
              issues: [],
              hasFatal: false,
              hasConflict: false,
              hasAdvisory: false,
              counts: { fatal: 0, conflict: 0, advisory: 0 },
              verifiedAt: new Date().toISOString(),
            } as any,
          }),
          { decisionDepth: 'FULL_SIMULATION' },
        ),
        { decisionDepth: 'FULL_SIMULATION' },
      ),
      { decisionDepth: 'FULL_SIMULATION' },
    );
    expect(dso.cognition?.futureSimulation).toBeTruthy();
    expect(admitPlanWrite(dso).ok).toBe(false);
    expect(admitPlanWrite(dso).missing).toContain('DECISION_AUTHORIZED');
    dso = markDecisionAuthorized(dso);
    expect(admitPlanWrite(dso).ok).toBe(true);
    const gated = gatePlanWriteAdmission(dso);
    expect(gated.admission.ok).toBe(true);
    expect(gated.dso.cognition?.admissionAudit?.some((a) => a.phase === 'plan_write' && a.ok)).toBe(
      true,
    );
  });

  it('attachFutureSimulation short-circuits without focused problem', () => {
    const dso = attachFutureSimulationCognition(
      attachRealityCognition(minimalDso(), { decisionDepth: 'FULL_SIMULATION' }),
      { decisionDepth: 'FULL_SIMULATION' },
    );
    expect(dso.cognition?.futureSimulation).toBeUndefined();
    expect(
      dso.cognition?.admissionAudit?.some(
        (a) => a.phase === 'future_simulation' && a.ok === false,
      ),
    ).toBe(true);
  });

  it('authorizeDecisionFromUserConfirmation on clarification answers', () => {
    expect(
      detectUserDecisionAuthorization({
        clarificationAnswers: [{ questionId: 'early_warning_relaxations', value: 'upgrade' }],
      }).authorized,
    ).toBe(true);
    expect(detectUserDecisionAuthorization({ explicitConsent: true }).reason).toBe(
      'explicit_consent',
    );

    let dso = attachRelationAndFocusCognition(minimalDso(), {
      decisionDepth: 'FULL_SIMULATION',
      enrichment: {
        earlyWarning: {
          risk_level: 'HIGH',
          conflict_type: 'WEATHER',
          evidence_summary: 'wind',
          predictive_failure_report: { audit_text: 'wind chain', simulated_repair_traces: [{}] },
        },
      },
    });
    dso = {
      ...dso,
      constraints: {
        feasible: false,
        gateOutcome: 'NEED_USER_CONFIRM',
        violations: [{ type: 'WIND', severity: 'HARD', detail: '高风' }],
      },
      cognition: {
        ...dso.cognition,
        focusedProblem: {
          ...(dso.cognition!.focusedProblem!),
          gateDisposition: 'NEED_CONFIRM',
        },
      },
    };
    dso = authorizeDecisionFromUserConfirmation(dso, {
      clarificationAnswers: [{ questionId: 'early_warning_relaxations', value: 'upgrade_vehicle_to_4wd' }],
      earlyWarningAcknowledged: true,
    });
    expect(dso.cognition?.markers).toContain('DECISION_AUTHORIZED');
    expect(dso.cognition?.focusedProblem?.gateDisposition).toBe('ALLOW');
    expect(dso.systemState?.earlyWarningAcknowledged).toBe(true);
  });
});
