export type SupplyContext = {
  pendingApplications: number;
  avgPendingBudgetCents: number | null;
  slotsRemaining: number;
  pricePerSlotCents: number | null;
};

export function buildSupplyContext(input: {
  slotsTotal: number;
  slotsFilled: number;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  pendingApplications: number;
  pendingBudgetCents: number[];
}): SupplyContext {
  const slotsRemaining = Math.max(0, input.slotsTotal - input.slotsFilled);
  const budgets = input.pendingBudgetCents.filter((v) => Number.isFinite(v) && v > 0);
  const avgPendingBudgetCents =
    budgets.length > 0 ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length) : null;
  const pricePerSlotCents =
    input.budgetMinCents && input.slotsTotal > 0
      ? Math.round(input.budgetMinCents / input.slotsTotal)
      : null;

  return {
    pendingApplications: input.pendingApplications,
    avgPendingBudgetCents,
    slotsRemaining,
    pricePerSlotCents,
  };
}
