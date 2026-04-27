import type { PreconditionAssessment, PreconditionFinding, ShadowDeltaView } from '../../interfaces/action.interface';

type WalletLike = {
  balance?: number;
  currency?: string;
  /** Optional warning threshold (not a hard block) */
  budget_limit?: number;
};

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function resolveWallet(state: any): WalletLike | undefined {
  const w = state?.wallet ?? state?.user_wallet ?? state?.userWallet;
  if (!w || typeof w !== 'object') return undefined;
  return w as WalletLike;
}

/**
 * Minimal BudgetImpactModel (shadow projection).
 * - Does not mutate DB/state.
 * - Uses action_input.price/amount + state.wallet.balance to compute delta.
 */
export function assessBudgetImpactForBookFlight(args: {
  actionInput: any;
  state: any;
  /** Optional: authorization/hold ratio (0..1], default 1.0 */
  holdRatio?: number;
}): Pick<PreconditionAssessment, 'findings' | 'shadow_delta' | 'status'> {
  const findings: PreconditionFinding[] = [];

  const wallet = resolveWallet(args.state);
  const priceRaw = num(args.actionInput?.price ?? args.actionInput?.amount);
  const ratio = (() => {
    const r = num(args.holdRatio);
    if (r === undefined) return 1;
    if (r <= 0) return 1;
    return r > 1 ? 1 : r;
  })();
  const price = typeof priceRaw === 'number' ? priceRaw * ratio : undefined;
  const currency = String(args.actionInput?.currency ?? wallet?.currency ?? 'USD');

  if (!wallet || num(wallet.balance) === undefined) {
    findings.push({
      code: 'MISSING_FIELD',
      message: 'Missing wallet balance for budget precheck.',
      path: 'wallet.balance',
      severity: 'BLOCK',
    });
    return { status: 'blocked', findings };
  }
  if (price === undefined || price <= 0) {
    findings.push({
      code: 'MISSING_FIELD',
      message: 'Missing flight price for budget impact assessment.',
      path: 'action_input.price',
      severity: 'WARN',
    });
    return { status: 'requires_confirmation', findings };
  }

  const current = num(wallet.balance)!;
  const delta = -Math.abs(price);
  const after = current + delta;

  const shadow_delta: ShadowDeltaView = {
    resources: {
      budget: { current, delta, after, currency },
    },
  };

  if (after < 0) {
    findings.push({
      code: 'INSUFFICIENT_FUNDS',
      message: 'Insufficient wallet balance to book flight.',
      path: 'wallet.balance',
      severity: 'BLOCK',
    });
    return { status: 'blocked', findings, shadow_delta };
  }

  const limit = num(wallet.budget_limit);
  if (limit !== undefined && after < limit) {
    findings.push({
      code: 'BUDGET_LIMIT_WARNING',
      message: 'Booking would drop wallet below budget_limit; requires confirmation.',
      path: 'wallet.budget_limit',
      severity: 'WARN',
    });
    return { status: 'requires_confirmation', findings, shadow_delta };
  }

  return { status: 'feasible', findings, shadow_delta };
}

