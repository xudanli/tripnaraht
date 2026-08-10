import { buildDecisionStateShadow } from './build-decision-state-shadow.util';
import { classifyDiningRiskDecision } from './classify-dining-risk-decision.util';
import { resolveDecisionTakeover } from './activity-decision-takeover.util';
import { resolveDecisionStateContractObservability } from './attach-decision-state-observability.util';
import { serializeActivityDecisionShadow } from './activity-decision-shadow.util';

describe('Dining / Risk Decision State', () => {
  it('分类：会不会太赶 → RISK.PACE_ASSESS', () => {
    expect(classifyDiningRiskDecision('第1天会不会太赶？').decisionClass).toBe(
      'RISK.PACE_ASSESS',
    );
  });

  it('PACE_ASSESS 有日锚 → ANSWER；压制 fatigue/pace 追问', () => {
    const shadow = buildDecisionStateShadow({
      message: 'Day1 会不会太赶\n[日程] Day1 · 抵达',
      diningRiskHints: {
        focusDayIndex: 1,
        tripId: 'trip-1',
        dayActivityCount: 0,
      },
      legacy: {
        wouldAskUser: true,
        blockKeys: ['fatigue', 'pacePreference', 'memberCapability'],
      },
    });
    expect(shadow.classified.decisionClass).toBe('RISK.PACE_ASSESS');
    expect(shadow.readiness?.nextAction).toBe('ANSWER');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
    expect(shadow.legacyCompare.divergenceCodes).toContain(
      'LEGACY_BLOCKED_ON_IGNORED_KEY',
    );
  });

  it('无日锚 pace → ASK day_anchor', () => {
    const shadow = buildDecisionStateShadow({
      message: '会不会太赶？',
    });
    expect(shadow.readiness?.askUserKeys).toContain('day_anchor');
    expect(resolveDecisionTakeover(shadow).kind).toBe('ASK_FROM_READINESS');
  });

  it('推荐餐厅无锚点 → DINING.RECOMMENDATION 泛化 ANSWER', () => {
    const shadow = buildDecisionStateShadow({
      message: '推荐餐厅',
    });
    expect(shadow.classified.decisionClass).toBe('DINING.RECOMMENDATION');
    expect(shadow.readiness?.nextAction).toBe('ANSWER');
  });

  it('黄金圈附近餐厅 → DINING.NEAR_POI', () => {
    const shadow = buildDecisionStateShadow({
      message: '推荐黄金圈附近的餐厅',
    });
    expect(shadow.classified.decisionClass).toBe('DINING.NEAR_POI');
  });

  it('天气耽误行程 → WEATHER_IMPACT；无天气 → FETCH', () => {
    const shadow = buildDecisionStateShadow({
      message: '这天气会不会耽误行程？',
      diningRiskHints: { tripId: 'trip-1' },
    });
    expect(shadow.classified.decisionClass).toBe('RISK.WEATHER_IMPACT');
    expect(shadow.readiness?.nextAction).toBe('FETCH');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
  });

  it('Assembler observability 挂载 decision_state_contract_shadow', () => {
    const shadow = buildDecisionStateShadow({
      message: '第1天会不会太赶？',
      diningRiskHints: { focusDayIndex: 1 },
    });
    const obs = resolveDecisionStateContractObservability({
      orchestrationResult: {
        result: { decisionStateShadow: serializeActivityDecisionShadow(shadow) },
      },
    });
    expect(obs.decision_state_contract_shadow?.schema).toBe(
      'tripnara.decision_state_contract_shadow@v1',
    );
    expect(obs.decision_state_contract_shadow?.decision_class).toBe(
      'RISK.PACE_ASSESS',
    );
  });
});
