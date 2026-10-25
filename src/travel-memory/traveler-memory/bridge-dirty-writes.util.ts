/**
 * 批量写入 Traveler Memory（M6 脏写收口）。
 */

import type { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import type { WriteTravelerMemoryRequestV1 } from './traveler-memory-contract.types';
import { writeTravelerMemoryObject } from './write-traveler-memory.util';
import type { TravelerMemoryWriteGateMode } from './resolve-write-gate-mode.util';

export type DirtyWriteBridgeAuditV1 = {
  schemaId: 'tripnara.dirty_write_bridge_audit@v1';
  version: 1;
  mode: TravelerMemoryWriteGateMode;
  source: 'standing' | 'preference_learning' | 'decision_dna';
  attempted: number;
  written: number;
  failed: number;
  legacyProfileWrite: boolean;
  reasons: string[];
};

export function bridgeWritesToTravelerMemory(
  runtime: Pick<TravelMemoryRuntimeService, 'writeCandidate' | 'confirm'> | null | undefined,
  mode: TravelerMemoryWriteGateMode,
  source: DirtyWriteBridgeAuditV1['source'],
  drafts: WriteTravelerMemoryRequestV1[],
  legacyProfileWrite: boolean,
): DirtyWriteBridgeAuditV1 {
  const audit: DirtyWriteBridgeAuditV1 = {
    schemaId: 'tripnara.dirty_write_bridge_audit@v1',
    version: 1,
    mode,
    source,
    attempted: drafts.length,
    written: 0,
    failed: 0,
    legacyProfileWrite,
    reasons: [],
  };
  if (mode === 'off' || !runtime || drafts.length === 0) {
    return audit;
  }
  for (const d of drafts) {
    const result = writeTravelerMemoryObject(runtime, d);
    if (result.ok === true) {
      audit.written += 1;
    } else {
      audit.failed += 1;
      audit.reasons.push(result.reason);
    }
  }
  return audit;
}
