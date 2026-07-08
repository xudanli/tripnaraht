/**
 * Read-only projection: Decision Semantics ledgerNodeToDecisionId ↔ Agent Ledger caused_by
 * for Memory Console and route_and_run observability.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import { buildLedgerNodeToDecisionIndex } from '../ledger/decision-ledger-causality.util';
import type { DecisionRecord } from '../types/decision-semantics.types';

const METADATA_KEY = 'decisionSemantics';

export type DecisionLedgerCausalityLinkSource = 'trip_metadata' | 'ledger_caused_by' | 'merged';

export interface DecisionLedgerCausalityLinkV1 {
  ledger_node_id: string;
  decision_id: string;
  problem_id?: string;
  decided_at?: string;
  status?: DecisionRecord['status'];
  source: DecisionLedgerCausalityLinkSource;
}

export interface DecisionLedgerCausalityConsoleV1 {
  revision: 'v1';
  trip_id: string;
  ledger_node_to_decision_id: Record<string, string>;
  links: DecisionLedgerCausalityLinkV1[];
  decision_records_count: number;
  ledger_snapshot_version?: number;
}

interface StoredDecisionSemanticsBlock {
  records?: DecisionRecord[];
  ledgerNodeToDecisionId?: Record<string, string>;
}

function linkSource(
  nodeId: string,
  fromMeta: Record<string, string>,
  fromLedger: Record<string, string>,
): DecisionLedgerCausalityLinkSource {
  const inMeta = fromMeta[nodeId] != null;
  const inLedger = fromLedger[nodeId] != null;
  if (inMeta && inLedger) return 'merged';
  if (inMeta) return 'trip_metadata';
  return 'ledger_caused_by';
}

export function mergeLedgerNodeToDecisionIdMaps(
  fromLedger: Record<string, string>,
  fromTripMetadata: Record<string, string>,
): Record<string, string> {
  return { ...fromLedger, ...fromTripMetadata };
}

export function buildDecisionLedgerCausalityConsoleV1(input: {
  tripId: string;
  fromTripMetadata: StoredDecisionSemanticsBlock | null | undefined;
  ledger?: DecisionLedgerSnapshot | null;
  ledgerSnapshotVersion?: number;
}): DecisionLedgerCausalityConsoleV1 | null {
  const fromMeta = input.fromTripMetadata?.ledgerNodeToDecisionId ?? {};
  const fromLedger = input.ledger ? buildLedgerNodeToDecisionIndex(input.ledger) : {};
  const merged = mergeLedgerNodeToDecisionIdMaps(fromLedger, fromMeta);

  if (!Object.keys(merged).length && !(input.fromTripMetadata?.records?.length)) {
    return null;
  }

  const recordById = new Map((input.fromTripMetadata?.records ?? []).map((r) => [r.id, r]));
  const links: DecisionLedgerCausalityLinkV1[] = Object.entries(merged).map(([nodeId, decisionId]) => {
    const record = recordById.get(decisionId);
    return {
      ledger_node_id: nodeId,
      decision_id: decisionId,
      problem_id: record?.problemId,
      decided_at: record?.decidedAt,
      status: record?.status,
      source: linkSource(nodeId, fromMeta, fromLedger),
    };
  });

  links.sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));

  return {
    revision: 'v1',
    trip_id: input.tripId,
    ledger_node_to_decision_id: merged,
    links,
    decision_records_count: input.fromTripMetadata?.records?.length ?? 0,
    ...(input.ledgerSnapshotVersion != null
      ? { ledger_snapshot_version: input.ledgerSnapshotVersion }
      : {}),
  };
}

export async function loadDecisionLedgerCausalityConsoleV1(input: {
  tripId: string;
  prisma: PrismaService;
  ledger?: DecisionLedgerSnapshot | null;
  ledgerSnapshotVersion?: number;
}): Promise<DecisionLedgerCausalityConsoleV1 | null> {
  const tid = String(input.tripId).trim();
  if (!tid) return null;

  const trip = await input.prisma.trip.findUnique({
    where: { id: tid },
    select: { metadata: true },
  });
  if (!trip) return null;

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const block = meta[METADATA_KEY] as StoredDecisionSemanticsBlock | undefined;

  return buildDecisionLedgerCausalityConsoleV1({
    tripId: tid,
    fromTripMetadata: block,
    ledger: input.ledger,
    ledgerSnapshotVersion: input.ledgerSnapshotVersion,
  });
}
