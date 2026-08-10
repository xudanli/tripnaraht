import {
  buildDecisionStateDivergenceV1,
  resetDecisionStateDivergenceCountersForTests,
  snapshotDecisionStateDivergenceCounters,
} from './decision-state-divergence.util';
import { buildDecisionStateShadow } from './build-decision-state-shadow.util';
import { resolveDecisionTakeover } from './activity-decision-takeover.util';
import { resolveDecisionStateContractObservability } from './attach-decision-state-observability.util';
import { resolveCreInteractionPolicy } from '../intent/interaction-policy';
import type { UnifiedIntentDecision } from '../intent/unified-intent.types';
import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';

describe('Decision State Divergence + InteractionPolicy defer', () => {
  beforeEach(() => {
    resetDecisionStateDivergenceCountersForTests();
  });

  it('legacy over-ask / ignored block 计入 divergence_v1', () => {
    const shadow = buildDecisionStateShadow({
      message: '预订第4天的冰川徒步活动',
      activityHints: {
        focusDayIndex: 4,
        dayConflict: { status: 'NONE' },
        activitySearchMeta: { mode: 'catalog_only', probed: 0 },
        teamFitness: { floor: 'HIGH', missingCount: 0 },
      },
      legacy: { wouldAskUser: true, blockKeys: ['day_pace'] },
    });
    const takeover = resolveDecisionTakeover(shadow);
    const div = buildDecisionStateDivergenceV1({ shadow, takeover });
    expect(div.schema).toBe('tripnara.decision_state_divergence@v1');
    expect(div.legacy_over_ask).toBe(true);
    expect(div.legacy_ignored_block).toBe(true);
    expect(div.takeover_kind).toBe('OBSERVE_ONLY_CONTINUE');
    const counters = snapshotDecisionStateDivergenceCounters();
    expect(counters['LEGACY_ASK_BUT_SHADOW_PROCEED']).toBeGreaterThanOrEqual(1);
  });

  it('InteractionPolicy decisionStateDefer → CONTINUE decision_state_owns_ask', () => {
    const intent = {
      semanticIntent: 'GLOBAL_PLAN',
    } as UnifiedIntentDecision;
    const plan = {
      operation: 'OPTIMIZE_TRIP',
      nextAction: 'ASK_USER',
      blockingGaps: [{ key: 'day_pace', status: 'BLOCKING', labelZh: '节奏' }],
      userQuestions: ['哪几天轻松？'],
    } as unknown as ContextRequirementPlan;
    const deferred = resolveCreInteractionPolicy({
      intent,
      plan,
      decisionStateDefer: true,
    });
    expect(deferred.outcome).toBe('CONTINUE');
    expect(deferred.reason).toBe('decision_state_owns_ask');
    expect(deferred.suppressedAskKeys).toContain('day_pace');
  });

  it('PLAN.DAY_REPLAN 接管 GLOBAL_PLAN 体能缺口', () => {
    const { buildDecisionStateShadow, resolveDecisionTakeover } = require('./index') as typeof import('./index');
    const shadow = buildDecisionStateShadow({
      message: '重新规划一下第一天',
      transportHints: { tripId: 'trip-1', focusDayIndex: 1 },
      legacy: {
        wouldAskUser: true,
        blockKeys: ['team.memberCapability', 'user.currentFatigue'],
      },
    });
    expect(shadow.classified.decisionClass).toBe('PLAN.DAY_REPLAN');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
    expect(shadow.legacyCompare.divergenceCodes).toContain(
      'LEGACY_BLOCKED_ON_IGNORED_KEY',
    );
  });

  it('formatDecisionStateDivergencePrometheus 含 HELP/TYPE', () => {
    const {
      bumpDecisionStateDivergence,
      formatDecisionStateDivergencePrometheus,
    } = require('./decision-state-divergence.util') as typeof import('./decision-state-divergence.util');
    bumpDecisionStateDivergence('LEGACY_ASK_BUT_SHADOW_PROCEED');
    const text = formatDecisionStateDivergencePrometheus();
    expect(text).toContain('tripnara_decision_state_divergence_total');
    expect(text).toContain('LEGACY_ASK_BUT_SHADOW_PROCEED');
  });

  it('observability 同时挂 shadow + divergence', () => {
    const shadow = buildDecisionStateShadow({
      message: '第1天会不会太赶？',
      diningRiskHints: { focusDayIndex: 1 },
      legacy: { wouldAskUser: true, blockKeys: ['fatigue'] },
    });
    const takeover = resolveDecisionTakeover(shadow);
    const div = buildDecisionStateDivergenceV1({ shadow, takeover });
    const obs = resolveDecisionStateContractObservability({
      orchestrationResult: {
        result: {
          decisionStateShadow: { schema: 'tripnara.decision_state_contract_shadow@v1' },
          decisionStateDivergence: div,
        },
      },
    });
    expect(obs.decision_state_contract_shadow?.schema).toBe(
      'tripnara.decision_state_contract_shadow@v1',
    );
    expect(obs.decision_state_divergence_v1?.legacy_ignored_block).toBe(true);
  });
});
