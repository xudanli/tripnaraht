import type { ComplexSideEffect, SideEffectPreviewResult, SideEffectApplyResult } from '../../interfaces/side-effect.interface';
import { assessBudgetImpactForBookFlight } from '../models/budget-impact.model';

const DEFAULT_TTL_SECONDS = 15 * 60;

function isoInSeconds(ttlSeconds: number): string {
  const msFromNow = Math.max(0, Math.round(ttlSeconds * 1000));
  return new Date(Date.now() + msFromNow).toISOString();
}

/**
 * FINANCIAL_HOLD (v1): purely in-memory projection + optional “hold record” patch.
 * - preview: returns shadow_delta budget + expiresAt
 * - apply: returns a state patch describing a (simulated) hold token
 */
export const FinancialHoldSideEffect: ComplexSideEffect = {
  id: 'side_effect.financial_hold.book_flight_v1',
  kind: 'FINANCIAL_HOLD',
  evidenceRequired: true,
  async preview(ctx, params): Promise<SideEffectPreviewResult | null> {
    // Only act on booking-like actions with explicit price
    const hasPrice = ctx.action_input && (ctx.action_input.price != null || ctx.action_input.amount != null);
    if (!hasPrice) return null;

    const ttl_seconds =
      typeof params?.ttl_seconds === 'number' && Number.isFinite(params.ttl_seconds) && params.ttl_seconds > 0
        ? params.ttl_seconds
        : DEFAULT_TTL_SECONDS;
    const hold_ratio =
      typeof params?.hold_ratio === 'number' && Number.isFinite(params.hold_ratio) && params.hold_ratio > 0
        ? params.hold_ratio
        : 1.0;
    const assessed = assessBudgetImpactForBookFlight({
      actionInput: ctx.action_input,
      state: ctx.state,
      holdRatio: hold_ratio,
    });
    return {
      kind: 'FINANCIAL_HOLD',
      deltaType: 'FINANCIAL_FLOW',
      confidence: 0.9,
      expiresAt: isoInSeconds(ttl_seconds),
      ...(assessed.shadow_delta ? { shadow_delta: assessed.shadow_delta } : {}),
      evidenceBundle: {
        kind: 'side_effect_evidence',
        message: 'Budget hold preview (no side effects applied).',
        evidence: {
          model: 'BudgetImpactModel.v1',
          ttl_seconds,
          hold_ratio,
        },
      },
    };
  },

  async apply(ctx, params): Promise<SideEffectApplyResult | null> {
    const ttl_seconds =
      typeof params?.ttl_seconds === 'number' && Number.isFinite(params.ttl_seconds) && params.ttl_seconds > 0
        ? params.ttl_seconds
        : DEFAULT_TTL_SECONDS;
    const hold_ratio =
      typeof params?.hold_ratio === 'number' && Number.isFinite(params.hold_ratio) && params.hold_ratio > 0
        ? params.hold_ratio
        : 1.0;
    const rawAmount =
      ctx.action_input && (ctx.action_input.amount != null || ctx.action_input.price != null)
        ? Number((ctx.action_input as any).amount ?? (ctx.action_input as any).price)
        : null;
    const amount = rawAmount != null && Number.isFinite(rawAmount) ? rawAmount * hold_ratio : null;
    const currency =
      ctx.action_input && (ctx.action_input as any).currency != null ? String((ctx.action_input as any).currency) : null;
    // Minimal v1 “apply”: emits a patch describing a hold token (caller decides persistence).
    return {
      kind: 'FINANCIAL_HOLD',
      state_patch: {
        side_effects: {
          financial_holds: [
            {
              hold_id: `hold_${ctx.action_id}`,
              action_id: ctx.action_id,
              action_name: ctx.action_name,
              ...(amount != null ? { amount } : {}),
              ...(currency ? { currency } : {}),
              expires_at: isoInSeconds(ttl_seconds),
            },
          ],
        },
      },
      evidenceBundle: {
        kind: 'side_effect_evidence',
        message: 'Financial hold applied (simulated patch).',
        evidence: { ttl_seconds, hold_ratio, ...(amount != null ? { amount } : {}), ...(currency ? { currency } : {}) },
      },
    };
  },
};

