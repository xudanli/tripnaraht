import {
  normalizeDecisionLogEntryForPersistence,
  PRD_FALLBACK_REASON_CODE,
} from './decision-log-entry-normalize.util';
import type { DecisionLogEntry } from './decision-result.types';

describe('normalizeDecisionLogEntryForPersistence', () => {
  const base = (): DecisionLogEntry => ({
    persona: 'ABU',
    action: 'ALLOW',
    explanation: 'ok',
    reasonCodes: [],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
  });

  it('leaves ALLOW with empty reasonCodes unchanged', () => {
    const e = base();
    const out = normalizeDecisionLogEntryForPersistence(e);
    expect(out.reasonCodes).toEqual([]);
  });

  it('fills REJECT with fallback when reasonCodes empty', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'REJECT',
      reasonCodes: [],
    });
    expect(out.reasonCodes).toEqual([PRD_FALLBACK_REASON_CODE]);
    expect(out.metadata?.prd_reason_codes_fallback).toBe(true);
    expect(out.metadata?.risk_tier).toBe('HIGH');
    expect(out.metadata?.prd_risk_tier_defaulted).toBe(true);
    expect(out.metadata?.responsibility_mode).toBe('ASSIST_ONLY');
    expect(out.metadata?.prd_responsibility_mode_defaulted).toBe(true);
  });

  it('does not override non-empty critical reasonCodes', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'ADJUST',
      reasonCodes: ['PACE_BUFFER'],
    });
    expect(out.reasonCodes).toEqual(['PACE_BUFFER']);
    expect(out.metadata?.risk_tier).toBe('MEDIUM');
    expect(out.metadata?.responsibility_mode).toBe('ASSIST_ONLY');
  });

  it('appends RULE_/CATEGORY_ auxiliary codes from metadata when fallback applies', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'REJECT',
      reasonCodes: [],
      metadata: { ruleId: 'visa/entry', category: 'entry_transit' },
    });
    expect(out.reasonCodes).toEqual([
      PRD_FALLBACK_REASON_CODE,
      'RULE_visa_entry',
      'CATEGORY_entry_transit',
    ]);
    expect(out.metadata?.prd_reason_codes_auxiliary).toEqual(['RULE_visa_entry', 'CATEGORY_entry_transit']);
  });

  it('appends TRIPRUN_ / PV_ when fallback applies', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'ADJUST',
      reasonCodes: [],
      metadata: {
        tripRunId: 'run-uuid/test',
        plan_version: 7,
      },
    });
    expect(out.reasonCodes).toEqual(
      expect.arrayContaining([PRD_FALLBACK_REASON_CODE, 'TRIPRUN_run-uuid_test', 'PV_7']),
    );
  });

  it('appends REQ_ from metadata.requestId when fallback applies', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'REPLACE',
      reasonCodes: [],
      metadata: { requestId: 'req-abc/001' },
    });
    expect(out.reasonCodes).toEqual(
      expect.arrayContaining([PRD_FALLBACK_REASON_CODE, 'REQ_req-abc_001']),
    );
  });

  it('appends DP_ from metadata.decisionPoint when fallback applies', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'MODIFY',
      reasonCodes: [],
      metadata: { decisionPoint: 'FINAL_CONFIRMATION', source: 'decision_logging_service' },
    });
    expect(out.reasonCodes).toEqual(
      expect.arrayContaining([
        PRD_FALLBACK_REASON_CODE,
        'DP_FINAL_CONFIRMATION',
        'SRC_decision_logging_service',
      ]),
    );
  });

  it('appends MOD_/SRC_/EVT_ from modificationType, source, event when fallback applies', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'ADJUST',
      reasonCodes: [],
      metadata: {
        modificationType: 'poi_replaced',
        source: 'flywheel',
        event: 'NEGOTIATION_REJECTED',
      },
    });
    expect(out.reasonCodes).toContain(PRD_FALLBACK_REASON_CODE);
    expect(out.reasonCodes).toEqual(
      expect.arrayContaining([
        PRD_FALLBACK_REASON_CODE,
        'MOD_poi_replaced',
        'SRC_flywheel',
        'EVT_NEGOTIATION_REJECTED',
      ]),
    );
    expect(out.reasonCodes?.length).toBe(4);
  });

  it('does not replace caller-provided risk_tier / responsibility_mode', () => {
    const out = normalizeDecisionLogEntryForPersistence({
      ...base(),
      action: 'REJECT',
      reasonCodes: ['POLICY'],
      metadata: { risk_tier: 'LOW', responsibility_mode: 'HUMAN_ONLY' },
    });
    expect(out.metadata?.risk_tier).toBe('LOW');
    expect(out.metadata?.prd_risk_tier_defaulted).toBeUndefined();
    expect(out.metadata?.responsibility_mode).toBe('HUMAN_ONLY');
    expect(out.metadata?.prd_responsibility_mode_defaulted).toBeUndefined();
  });
});
