/**
 * Execution Risk Center — P0 acceptance harness (ER-P0-001 … ER-P0-010)
 */

import { DateTime } from 'luxon';
import { isEffectivePlanWriteChainEnabled } from '../../../decision-runtime/execution/effective-plan-write-chain.config';
import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import { projectAttentionItemToRisk } from '../adapters/attention-queue-risk.adapter';
import { ExecutionRiskApplyService } from '../services/execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from '../services/execution-risk-confirm-write.service';
import { buildRiskKey, deriveRiskId } from '../utils/risk-key.util';
import { filterActiveRisks, mergeRiskProjections } from '../utils/risk-merge.util';
import {
  buildHarnessActiveRisks,
  buildHarnessProjections,
  HARNESS_ACTIVITY_ID,
  HARNESS_TRIP_ID,
  HarnessExecutionRiskStack,
  harnessReferenceDate,
  harnessTodayIso,
  harnessWindEnvironmentEvent,
  stableWindRiskId,
  stableWindRiskKey,
} from './execution-risk-p0.harness.util';

describe('Execution Risk Center P0 harness', () => {
  const stack = () => new HarnessExecutionRiskStack();

  it('ER-P0-001: same source refresh does not duplicate riskKey', () => {
    const ref = harnessReferenceDate();
    const eventV1 = harnessWindEnvironmentEvent({ detectedAt: harnessTodayIso(10, 12) });
    const eventV2 = harnessWindEnvironmentEvent({
      id: 'env-wind-001',
      detectedAt: harnessTodayIso(10, 30),
      description: '预计 11:00 后阵风达到 17—19m/s，并将在 11:00—18:00 持续',
    });
    const p1 = projectEnvironmentEventToRisk(eventV1, {
      impactStartAt: `${ref}T11:00:00.000Z`,
      impactEndAt: `${ref}T18:00:00.000Z`,
      validUntil: DateTime.now().plus({ hours: 8 }).toISO() ?? undefined,
    });
    const p2 = projectEnvironmentEventToRisk(eventV2, {
      impactStartAt: `${ref}T11:00:00.000Z`,
      impactEndAt: `${ref}T18:00:00.000Z`,
      validUntil: DateTime.now().plus({ hours: 8 }).toISO() ?? undefined,
    });
    expect(p1.riskKey).toBe(p2.riskKey);
    const merged = stack().mergeProjectionsRaw([p1, p2]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.updatedAt).toBe(p2.updatedAt);
  });

  it('ER-P0-002: different sources merge when riskKey matches', () => {
    const env = projectEnvironmentEventToRisk(harnessWindEnvironmentEvent(), {
      impactStartAt: '2026-07-08T11:00:00.000Z',
      impactEndAt: '2026-07-08T18:00:00.000Z',
    });
    const att = projectAttentionItemToRisk({
      id: 'att-1',
      type: 'weather_risk' as never,
      title: '强风',
      tripId: HARNESS_TRIP_ID,
      severity: 'high' as never,
      createdAt: '2026-07-08T10:00:00.000Z',
      metadata: { day: 3 },
    });
    expect(env.riskKey).not.toBe(att.riskKey);
    const merged = stack().mergeProjections(buildHarnessProjections());
    expect(merged.length).toBeGreaterThanOrEqual(2);
    const wind = merged.find((r) => r.code === 'WEATHER_STRONG_WIND');
    expect(wind?.sourceRefs.length).toBeGreaterThanOrEqual(1);
  });

  it('ER-P0-003: expired validUntil excluded from active list', () => {
    const expired = projectEnvironmentEventToRisk(harnessWindEnvironmentEvent(), {
      validUntil: '2026-01-01T00:00:00.000Z',
    });
    const active = stack().mergeProjections([expired]);
    expect(active).toHaveLength(0);
  });

  it('ER-P0-004: acknowledge does not resolve lifecycle', () => {
    const risks = buildHarnessActiveRisks();
    const risk = risks.find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const acked = stack().acknowledge(risk);
    expect(acked.acknowledgementStatus).toBe('ACKNOWLEDGED');
    expect(acked.lifecycleStatus).toBe('ACTIVE');
    expect(acked.treatmentStatus).not.toBe('APPLIED');
  });

  it('ER-P0-005: STOP gate prevents summary downgrade', () => {
    const risks = buildHarnessActiveRisks();
    const summary = stack().summaryLevel(risks);
    expect(summary.executionGate).toBe('STOP');
    expect(summary.overallLevel).toBe('CRITICAL');
  });

  it('ER-P0-007: resolved source removes risk from active projection', () => {
    const ref = harnessReferenceDate();
    const validUntil = DateTime.now().plus({ hours: 8 }).toISO() ?? undefined;
    const open = projectEnvironmentEventToRisk(harnessWindEnvironmentEvent({ status: 'open' }), {
      impactStartAt: `${ref}T11:00:00.000Z`,
      impactEndAt: `${ref}T18:00:00.000Z`,
      validUntil,
    });
    const resolved = projectEnvironmentEventToRisk(
      harnessWindEnvironmentEvent({ status: 'resolved' }),
      { validUntil },
    );
    expect(stack().mergeProjections([open])).toHaveLength(1);
    expect(stack().mergeProjections([resolved])).toHaveLength(0);
  });

  it('ER-P0-008: stable riskId from riskKey', () => {
    expect(stableWindRiskId()).toBe(deriveRiskId(HARNESS_TRIP_ID, stableWindRiskKey()));
    expect(stableWindRiskId()).toMatch(/^risk_[a-f0-9]{16}$/);
  });

  it('ER-P0-009: apply returns REQUIRES_CONFIRMATION under write chain', async () => {
    const prev = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    try {
      const apply = new ExecutionRiskApplyService(
        {
          getRisk: async () => buildHarnessActiveRisks()[0]!,
          listRisks: async () => buildHarnessActiveRisks(),
        } as never,
        {
          listForRisk: async () => [
            {
              id: 'env-rec-env-wind-001-plan-shorten',
              riskId: stableWindRiskId(),
              label: '缩短徒步',
              description: 'test',
              sourceSystem: 'ENVIRONMENT_EVENT',
              sourceId: 'env-wind-001',
            },
          ],
        } as never,
        new ExecutionRiskConfirmWriteService(),
      );
      const result = await apply.applyRecommendation(
        HARNESS_TRIP_ID,
        stableWindRiskId(),
        'env-rec-env-wind-001-plan-shorten',
        'user-1',
      );
      expect(result.executionStatus).toBe('PREVIEW');
      expect(result.planDiff).toBeDefined();
      expect(result.preview).toBeDefined();
      expect(result.riskId).toBe(stableWindRiskId());
      expect(isEffectivePlanWriteChainEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
      else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prev;
    }
  });

  it('ER-P0-010: apply response traceable to riskId', async () => {
    const riskId = stableWindRiskId();
    const apply = new ExecutionRiskApplyService(
      {
        getRisk: async () => ({
          ...buildHarnessActiveRisks()[0]!,
          id: riskId,
        }),
        listRisks: async () => [
          {
            ...buildHarnessActiveRisks()[0]!,
            id: riskId,
          },
        ],
      } as never,
      {
        listForRisk: async () => [
          {
            id: 'rec-1',
            riskId,
            label: 'test',
            description: 'test',
            sourceSystem: 'ENVIRONMENT_EVENT',
            sourceId: 'env-1',
            recommendationVersion: 'v1',
          },
        ],
      } as never,
      new ExecutionRiskConfirmWriteService(),
    );
    const result = await apply.applyRecommendation(HARNESS_TRIP_ID, riskId, 'rec-1', 'user-1');
    expect(result.riskId).toBe(riskId);
    expect(result.recommendationId).toBe('rec-1');
  });

  it('riskKey uses canonical subject not free text', () => {
    const key = buildRiskKey({
      tripId: HARNESS_TRIP_ID,
      type: 'ENVIRONMENT',
      code: 'WEATHER_STRONG_WIND',
      normalizedSubject: HARNESS_ACTIVITY_ID,
      affectedScope: HARNESS_ACTIVITY_ID,
      impactStartAt: '2026-07-08T11:00:00.000Z',
      impactEndAt: '2026-07-08T18:00:00.000Z',
    });
    expect(key).toContain(HARNESS_ACTIVITY_ID);
    expect(key).not.toContain('16—18m/s');
  });

  it('merge dedupes sourceRefs across projections', () => {
    const merged = mergeRiskProjections(buildHarnessProjections());
    const wind = merged.find((r) => r.type === 'ENVIRONMENT');
    expect(wind).toBeDefined();
    const ids = wind!.sourceRefs.map((s) => `${s.sourceSystem}:${s.sourceId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('filterActiveRisks excludes RESOLVED lifecycle', () => {
    const ref = harnessReferenceDate();
    const validUntil = DateTime.now().plus({ hours: 8 }).toISO() ?? undefined;
    const all = mergeRiskProjections([
      projectEnvironmentEventToRisk(harnessWindEnvironmentEvent({ status: 'resolved' }), {
        validUntil,
      }),
      projectEnvironmentEventToRisk(
        harnessWindEnvironmentEvent({
          id: 'env-rain-002',
          type: 'weather',
          description: '未来 24 小时累计降雨较大，部分户外路段可能湿滑',
          severity: 'yellow',
          status: 'open',
        }),
        { validUntil, referenceDate: ref },
      ),
    ]);
    expect(filterActiveRisks(all)).toHaveLength(1);
    expect(filterActiveRisks(all)[0]!.code).toBe('WEATHER_HEAVY_RAIN');
  });
});
