import type { BalanceEdge, LedgerEntry, WalletBalances } from '../types/travel-wallet.types';

/**
 * Compute net balances from unsettled ledger entries.
 * Positive net = should receive; negative = should pay.
 */
export function computeNetByUser(entries: LedgerEntry[]): Record<string, number> {
  const net: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.settled) continue;

    const splits =
      entry.splitAmongUserIds.length > 0
        ? entry.splitAmongUserIds
        : [entry.paidByUserId];
    const share = entry.sharePerPerson;

    net[entry.paidByUserId] = roundMoney((net[entry.paidByUserId] ?? 0) + entry.amount);

    for (const uid of splits) {
      net[uid] = roundMoney((net[uid] ?? 0) - share);
    }
  }

  return net;
}

/**
 * Greedy pairwise settlement edges from net positions.
 */
export function computeBalanceEdges(
  netByUser: Record<string, number>,
  currency: string,
): BalanceEdge[] {
  const debtors: Array<{ userId: string; amount: number }> = [];
  const creditors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, balance] of Object.entries(netByUser)) {
    const rounded = roundMoney(balance);
    if (rounded < -0.01) {
      debtors.push({ userId, amount: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ userId, amount: rounded });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const edges: BalanceEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const transfer = roundMoney(Math.min(debtors[i].amount, creditors[j].amount));
    if (transfer > 0.01) {
      edges.push({
        fromUserId: debtors[i].userId,
        toUserId: creditors[j].userId,
        amount: transfer,
        currency,
      });
    }
    debtors[i].amount = roundMoney(debtors[i].amount - transfer);
    creditors[j].amount = roundMoney(creditors[j].amount - transfer);
    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return edges;
}

export function buildWalletBalances(
  entries: LedgerEntry[],
  currency: string,
): WalletBalances {
  const unsettled = entries.filter((e) => !e.settled);
  const netByUser = computeNetByUser(unsettled);
  const edges = computeBalanceEdges(netByUser, currency);
  return { currency, edges, netByUser };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSharePerPerson(amount: number, splitCount: number): number {
  if (splitCount <= 0) return amount;
  return roundMoney(amount / splitCount);
}
