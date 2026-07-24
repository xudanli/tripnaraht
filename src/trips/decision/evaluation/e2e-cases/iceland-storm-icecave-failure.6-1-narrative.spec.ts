/**
 * 6.1 叙事弹性：南岸暴风雪 + 蓝冰洞取消（合成 fixture 驱动）。
 * 验证挫败感熔断下歉意恢复优先，并压制「省钱式」Loss-Gain 话术。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ResearchConflictNegotiationReport } from '../../../../agent/teams/research/research-conflict-negotiation.types';
import { buildResearchConflictNegotiationReport } from '../../../../agent/teams/research/research-conflict-negotiation.util';
import {
  buildEbpToneMannerInstructionZh,
  buildEmpathicValueFramingInstructionZh,
  mapVoiceToneModifierForNegotiationAndBudget,
} from '../../../../agent/utils/narrator-ebp-tone.util';
import { analyzeDiff } from '../e2e-assertions';
import { buildDecisionLogsForFixture } from '../e2e-replay.fixture-mocks';
import { buildDecisionTraceSummary } from '../replay-trace-contract';
import { icelandStormIcecaveFailureCase } from './iceland-storm-icecave-failure.example';
import { icelandStormRecoveryExperienceFirstCase } from './iceland-storm-recovery-experience-first.example';

type StormFixtureDoc = {
  user_emotional_account: ResearchConflictNegotiationReport['user_emotional_account'];
  negotiationReportOverlay: Partial<ResearchConflictNegotiationReport>;
  narrativeExpectations_6_1: {
    must_contain_substrings_zh: string[];
    forbidden_patterns_zh: string[];
  };
};

function loadStormDoc(): StormFixtureDoc {
  const p = path.join(__dirname, 'iceland-storm-icecave-failure.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as StormFixtureDoc;
}

function buildStormNegotiationReport(doc: StormFixtureDoc): ResearchConflictNegotiationReport {
  const stitched = buildResearchConflictNegotiationReport({
    mergeLog: [
      {
        source: 'ComplianceResearchMember',
        phase: 'parallel',
        keysTouched: ['safetravel_alerts'],
        evidenceRefsAppended: 1,
        attribution: 'MEMBER_PATCH',
      },
      {
        source: 'DestinationResearchMember',
        phase: 'parallel',
        keysTouched: ['poi_blue_ice'],
        evidenceRefsAppended: 1,
        attribution: 'MEMBER_PATCH',
      },
      {
        source: 'FALLBACK_SUTURE',
        phase: 'parallel',
        keysTouched: ['draft_itinerary'],
        evidenceRefsAppended: 0,
        attribution: 'FALLBACK_SUTURE',
      },
    ],
    teamMergeSummary: {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 3,
      scope_mutations: {
        compliance: { updated_keys: ['safetravel_alerts'], evidence_added_count: 1 },
        destination: { updated_keys: ['poi_blue_ice'], evidence_added_count: 1 },
      },
      fallback_suture_count: 1,
    },
    realtimeRerollCount: 2,
  });

  const ov = doc.negotiationReportOverlay;
  return {
    ...stitched,
    ...ov,
    user_emotional_account: doc.user_emotional_account ?? stitched.user_emotional_account,
    mental_offset_hints: {
      ...stitched.mental_offset_hints,
      ...ov.mental_offset_hints,
    },
    items: (ov.items as ResearchConflictNegotiationReport['items']) ?? stitched.items,
  };
}

describe('Iceland storm + ice cave synthetic fixture (6.1 narrative contract)', () => {
  const doc = loadStormDoc();

  it('metadata snapshot is attached to the E2E case for offline tooling', () => {
    expect(icelandStormIcecaveFailureCase.metadata?.cgusDsoSnapshot).toBeDefined();
    const snap = icelandStormIcecaveFailureCase.metadata?.cgusDsoSnapshot as Record<string, unknown>;
    expect(snap.caseId).toBe('iceland-storm-icecave-failure-001');
    expect((snap.strategySignals as any)?.weather_severity).toBe('RED_ALERT');
  });

  it('apology / empathy framing wins over Loss-Gain when frustration circuit is active', () => {
    const report = buildStormNegotiationReport(doc);
    const empathic = buildEmpathicValueFramingInstructionZh(report);
    for (const s of doc.narrativeExpectations_6_1.must_contain_substrings_zh) {
      expect(empathic).toContain(s);
    }
    expect(empathic).not.toContain('Loss-Gain');
    for (const pat of doc.narrativeExpectations_6_1.forbidden_patterns_zh) {
      expect(empathic).not.toMatch(new RegExp(pat));
    }
  });

  it('voice stays empathetic even with aggregate savings in research_data (no rational_frugal)', () => {
    const report = buildStormNegotiationReport(doc);
    expect(
      mapVoiceToneModifierForNegotiationAndBudget(report, {
        __research_global_financial_report: { budget_aggregate_savings: 50 },
      }),
    ).toBe('empathetic_reassurance');
  });

  it('combined EBP + empathic blocks do not reintroduce Loss-Gain when budget savings are passed', () => {
    const report = buildStormNegotiationReport(doc);
    const ebp = buildEbpToneMannerInstructionZh(report, { budget_savings_yuan: 50 });
    const empathic = buildEmpathicValueFramingInstructionZh(report, { budget_savings_yuan: 50 });
    const combined = `${empathic}\n${ebp}`;
    expect(combined).toContain('歉意恢复');
    expect(combined).not.toContain('Loss-Gain');
    expect(combined).not.toMatch(/省下.*50|虽然多开了/);
    const iApology = combined.indexOf('歉意恢复');
    const iComp = combined.indexOf('AGGRESSIVE_COMPENSATION');
    expect(iApology).toBeGreaterThanOrEqual(0);
    expect(iComp).toBeGreaterThanOrEqual(0);
    expect(iApology).toBeLessThan(iComp);
  });
});

describe('TD-05 traceSignals (stability / frustration / narrative_track)', () => {
  it('storm: JSON expected.trace_signals stays aligned with E2ECase.traceSignals', () => {
    const snap = icelandStormIcecaveFailureCase.metadata?.cgusDsoSnapshot as Record<string, unknown>;
    const ex = snap.expected as { trace_signals: Record<string, unknown> };
    expect(icelandStormIcecaveFailureCase.expected.traceSignals?.stability_mode_active).toBe(
      ex.trace_signals.stability_mode_active,
    );
  });

  it('storm: PLAN_SCORE metadata + analyzeDiff accept traceSignals', () => {
    const logs = buildDecisionLogsForFixture(icelandStormIcecaveFailureCase);
    const meta = logs.find((l) => l.decisionStage === 'PLAN_SCORE')?.metadata as Record<string, unknown>;
    expect(meta.stability_mode_active).toBe(true);
    expect(meta.frustration_circuit_triggered).toBe(true);
    expect(meta.narrative_track).toBe('EMPATHY_RECOVERY');
    const diff = analyzeDiff(icelandStormIcecaveFailureCase.expected, {
      logs,
      finalPlan: { allowed: true, days: 5 },
      traceSummary: buildDecisionTraceSummary(logs),
    });
    expect(diff.traceSignalsDiff).toBeUndefined();
    expect(diff.hasDiff).toBe(false);
  });

  it('recovery: clears stability flags and sets EXPERIENCE_FIRST', () => {
    const logs = buildDecisionLogsForFixture(icelandStormRecoveryExperienceFirstCase);
    const meta = logs.find((l) => l.decisionStage === 'PLAN_SCORE')?.metadata as Record<string, unknown>;
    expect(meta.stability_mode_active).toBe(false);
    expect(meta.frustration_circuit_triggered).toBe(false);
    expect(meta.narrative_track).toBe('EXPERIENCE_FIRST');
    const diff = analyzeDiff(icelandStormRecoveryExperienceFirstCase.expected, {
      logs,
      finalPlan: { allowed: true, days: 5 },
      traceSummary: buildDecisionTraceSummary(logs),
    });
    expect(diff.hasDiff).toBe(false);
  });
});
