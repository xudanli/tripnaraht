/**
 * JSON-safe wire format for Trip.metadata.ecoIdentityLedgerV1 (Prisma / cold resume).
 */

import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

export const ECO_IDENTITY_LEDGER_SCHEMA_V1 = 'eco-identity-ledger-v1' as const;

/** Root-level Trip.metadata key — integer, incremented on each successful ledger save. */
export const ECO_IDENTITY_LEDGER_METADATA_REVISION_KEY = 'ecoIdentityLedgerRevision' as const;

export function parseEcoLedgerRevisionFromTripMetadata(meta: Record<string, unknown>): number {
  const r = meta[ECO_IDENTITY_LEDGER_METADATA_REVISION_KEY];
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}

export interface EcoIdentityLedgerWireEnvelope {
  schemaVersion: typeof ECO_IDENTITY_LEDGER_SCHEMA_V1;
  ledger: EcoIdentityLedgerSnapshot;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function serializeEcoIdentityLedgerForTripMetadata(
  ledger: EcoIdentityLedgerSnapshot,
): EcoIdentityLedgerWireEnvelope {
  return { schemaVersion: ECO_IDENTITY_LEDGER_SCHEMA_V1, ledger };
}

export function parseEcoIdentityLedgerFromTripMetadata(
  raw: unknown,
): EcoIdentityLedgerSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ECO_IDENTITY_LEDGER_SCHEMA_V1) return undefined;
  const ledger = raw.ledger;
  if (!isRecord(ledger)) return undefined;

  const required = [
    'recordedAt',
    'semanticCoreHash',
    'reflectiveLineage',
    'existentialContinuityScore',
    'ontologicalIntegrity',
    'epistemicUndecidable',
    'confidenceSaturated',
    'carryForwardMetaFreeze',
    'carryForwardRecursiveFreeze',
    'carryForwardSuggestRollback',
    'digestFingerprint',
  ] as const;

  for (const k of required) {
    if (!(k in ledger)) return undefined;
  }

  if (typeof ledger.recordedAt !== 'string') return undefined;
  if (typeof ledger.semanticCoreHash !== 'string') return undefined;
  if (typeof ledger.reflectiveLineage !== 'string') return undefined;
  if (typeof ledger.digestFingerprint !== 'string') return undefined;

  const out = ledger as unknown as EcoIdentityLedgerSnapshot;
  if ('ecoIdentityLineage' in ledger && ledger.ecoIdentityLineage !== undefined) {
    const lin = parseEcoIdentityLineageField(ledger.ecoIdentityLineage);
    if (lin) {
      out.ecoIdentityLineage = lin;
    }
  }

  return out;
}

function parseEcoIdentityLineageField(raw: unknown):
  | import('./eco-identity-lineage.types').EcoIdentityLineage
  | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.ledgerId !== 'string' || typeof raw.branchId !== 'string') return undefined;
  if (typeof raw.depth !== 'number' || !Number.isFinite(raw.depth)) return undefined;
  const parentLedgerId =
    typeof raw.parentLedgerId === 'string' ? raw.parentLedgerId : undefined;
  return {
    ledgerId: raw.ledgerId,
    ...(parentLedgerId !== undefined ? { parentLedgerId } : {}),
    branchId: raw.branchId,
    depth: Math.max(0, Math.floor(raw.depth)),
  };
}
