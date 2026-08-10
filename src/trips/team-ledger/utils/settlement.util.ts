import { createHash } from 'crypto';
import type {
  LedgerTransferStatus,
  PendingExpenseForSettlement,
  TeamLedgerMember,
  TeamLedgerTransfer,
} from '../types/team-ledger.types';

/**
 * Split amountCents across members; remainder (+1¢) assigned by sorted member id.
 */
export function allocateSharesCents(
  amountCents: number,
  memberIds: string[],
): Map<string, number> {
  const shares = new Map<string, number>();
  if (memberIds.length === 0 || amountCents <= 0) return shares;

  const unique = [...new Set(memberIds)];
  const n = unique.length;
  const base = Math.floor(amountCents / n);
  let rem = amountCents - base * n;
  const sorted = [...unique].sort();
  for (const id of sorted) {
    shares.set(id, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
  }
  return shares;
}

/** Positive = should receive; negative = should pay. */
export function computeNetCents(
  expenses: PendingExpenseForSettlement[],
): Record<string, number> {
  const net: Record<string, number> = {};

  for (const exp of expenses) {
    const splits =
      exp.splitMemberIds.length > 0 ? exp.splitMemberIds : [exp.payerMemberId];
    net[exp.payerMemberId] = (net[exp.payerMemberId] ?? 0) + exp.amountCents;

    const shares = allocateSharesCents(exp.amountCents, splits);
    for (const [memberId, share] of shares) {
      net[memberId] = (net[memberId] ?? 0) - share;
    }
  }

  return net;
}

export interface MinimalTransferEdge {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

/** Greedy minimal transfers from net positions (integer cents). */
export function computeMinimalTransfers(
  netByMember: Record<string, number>,
): MinimalTransferEdge[] {
  const debtors: Array<{ memberId: string; amount: number }> = [];
  const creditors: Array<{ memberId: string; amount: number }> = [];

  for (const [memberId, balance] of Object.entries(netByMember)) {
    if (balance < 0) {
      debtors.push({ memberId, amount: -balance });
    } else if (balance > 0) {
      creditors.push({ memberId, amount: balance });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));
  creditors.sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));

  const edges: MinimalTransferEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount);
    if (transfer > 0) {
      edges.push({
        fromMemberId: debtors[i].memberId,
        toMemberId: creditors[j].memberId,
        amountCents: transfer,
      });
    }
    debtors[i].amount -= transfer;
    creditors[j].amount -= transfer;
    if (debtors[i].amount <= 0) i += 1;
    if (creditors[j].amount <= 0) j += 1;
  }

  return edges;
}

/** Raw pairwise debt edges before offset (one per non-payer split share). */
export function countRawPairwiseEdges(
  expenses: PendingExpenseForSettlement[],
): number {
  let count = 0;
  for (const exp of expenses) {
    const splits =
      exp.splitMemberIds.length > 0 ? exp.splitMemberIds : [exp.payerMemberId];
    for (const mid of new Set(splits)) {
      if (mid !== exp.payerMemberId) count += 1;
    }
  }
  return count;
}

export function resolveAutoOffsetLabel(
  expenses: PendingExpenseForSettlement[],
  transfers: MinimalTransferEdge[],
): string {
  if (transfers.length === 0) return '无';
  const raw = countRawPairwiseEdges(expenses);
  return raw > transfers.length ? '互相欠款' : '无';
}

export function stableTransferId(
  tripId: string,
  fromMemberId: string,
  toMemberId: string,
  amountCents: number,
): string {
  const digest = createHash('sha256')
    .update(`${tripId}|${fromMemberId}|${toMemberId}|${amountCents}`)
    .digest('hex')
    .slice(0, 16);
  return `t_${digest}`;
}

export function buildSettlementTransfers(params: {
  tripId: string;
  expenses: PendingExpenseForSettlement[];
  memberById: Map<string, TeamLedgerMember>;
  confirmKeys: Set<string>;
}): {
  transfers: TeamLedgerTransfer[];
  autoOffsetLabel: string;
  pendingTotalCents: number;
  involvedCount: number;
} {
  const net = computeNetCents(params.expenses);
  const edges = computeMinimalTransfers(net);
  const autoOffsetLabel = resolveAutoOffsetLabel(params.expenses, edges);

  const fallbackMember = (id: string): TeamLedgerMember => ({
    id,
    name: id.slice(0, 8),
    avatarUrl: null,
    participatesInSplit: true,
  });

  const transfers: TeamLedgerTransfer[] = edges.map((edge) => {
    const key = confirmKey(edge.fromMemberId, edge.toMemberId, edge.amountCents);
    const status: LedgerTransferStatus = params.confirmKeys.has(key)
      ? 'settled'
      : 'pending';
    return {
      id: stableTransferId(
        params.tripId,
        edge.fromMemberId,
        edge.toMemberId,
        edge.amountCents,
      ),
      from: params.memberById.get(edge.fromMemberId) ?? fallbackMember(edge.fromMemberId),
      to: params.memberById.get(edge.toMemberId) ?? fallbackMember(edge.toMemberId),
      amountCents: edge.amountCents,
      status,
    };
  });

  const involved = new Set<string>();
  for (const t of transfers) {
    involved.add(t.from.id);
    involved.add(t.to.id);
  }

  return {
    transfers,
    autoOffsetLabel,
    pendingTotalCents: transfers.reduce((s, t) => s + t.amountCents, 0),
    involvedCount: involved.size,
  };
}

export function confirmKey(
  fromMemberId: string,
  toMemberId: string,
  amountCents: number,
): string {
  return `${fromMemberId}|${toMemberId}|${amountCents}`;
}
