/**
 * Traveler Memory 写入适配 — 经 TMR writeCandidate/confirm，不平行建库。
 */

import type { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import type { MemoryType, MemorySourceType } from '../types/memory-event.types';
import type { MemorySubject } from '../types/memory-scope.types';
import type { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import {
  type TravelerMemoryObjectV1,
  type WriteTravelerMemoryRequestV1,
  type WriteTravelerMemoryResultV1,
} from './traveler-memory-contract.types';
import {
  buildTravelerMemoryLedgerValue,
  memoryEventToTravelerMemoryObject,
  travelerMemoryObjectPredicate,
  validateWriteTravelerMemoryRequest,
} from './validate-traveler-memory-object.util';
import { TRAVELER_MEMORY_PREDICATE_PREFIX } from './traveler-memory-contract.types';
import { LEGACY_PREDICATE_TO_TRAVELER_MEMORY } from './traveler-memory-predicate.util';

function mapSemanticToMemoryType(
  semantic: WriteTravelerMemoryRequestV1['semantic_type'],
): MemoryType {
  if (semantic === 'CONSTRAINT') return 'CONSTRAINT';
  return 'PREFERENCE';
}

function mapSourceToTmrSourceType(
  sources: WriteTravelerMemoryRequestV1['source'],
  explicitConfirm?: boolean,
): MemorySourceType {
  if (explicitConfirm || sources.includes('EXPLICIT')) return 'USER_EXPLICIT';
  if (sources.includes('EPISODIC')) return 'DECISION_OUTCOME';
  if (sources.includes('BEHAVIORAL')) return 'STRONG_INFERENCE';
  return 'WEAK_SIGNAL';
}

/**
 * 校验 → 编码 predicate → TMR Ledger 写入 → 返回 Contract Object。
 */
export function writeTravelerMemoryObject(
  runtime: Pick<TravelMemoryRuntimeService, 'writeCandidate' | 'confirm'>,
  req: WriteTravelerMemoryRequestV1,
): WriteTravelerMemoryResultV1 {
  const issues = validateWriteTravelerMemoryRequest(req);
  if (issues.length > 0) {
    return {
      ok: false,
      reason: issues.map((i) => `${i.field}:${i.message}`).join(';'),
    };
  }

  const scope = req.scope ?? 'GLOBAL_USER';
  const subject: MemorySubject =
    scope === 'TRIP' && req.trip_id
      ? { type: 'TRIP', id: String(req.trip_id) }
      : { type: 'USER', id: req.subject_id };

  const predicate = travelerMemoryObjectPredicate(req);
  const value = buildTravelerMemoryLedgerValue({ ...req, scope });
  const sourceType = mapSourceToTmrSourceType(req.source, req.explicitConfirm);

  if (req.explicitConfirm) {
    const event = runtime.confirm({
      subject,
      predicate,
      value,
      scope,
    });
    const object = memoryEventToTravelerMemoryObject(event);
    if (!object) {
      return { ok: false, reason: 'confirm_projection_failed' };
    }
    return { ok: true, object, eventId: event.memoryEventId };
  }

  const result = runtime.writeCandidate({
    subject,
    memoryType: mapSemanticToMemoryType(req.semantic_type),
    predicate,
    value,
    scope,
    sourceType,
    confidence: req.confidence,
    explicitConfirm: req.source.includes('EXPLICIT'),
    conversationId: req.conversationId,
    turnId: req.turnId,
    decisionId: req.decisionId,
    episodeId: req.episodeId,
    evidenceRefs: req.evidence_refs,
  });

  if (result.ok === false) {
    return {
      ok: false,
      reason: result.reason,
      keepEpisodeOnly: result.keepEpisodeOnly,
    };
  }
  const object = memoryEventToTravelerMemoryObject(result.event);
  if (!object) {
    return { ok: false, reason: 'write_projection_failed' };
  }
  return { ok: true, object, eventId: result.event.memoryEventId };
}

/**
 * 从 Ledger 列出某 subject 的 Traveler Memory Objects（含 legacy 谓词投影）。
 * CANDIDATE 默认包含（供 Profile 校对）；决策侧仍由 ETC/门控过滤。
 */
export function listTravelerMemoryObjects(
  ledger: Pick<MemoryLedgerStore, 'list'>,
  subjectId: string,
  opts?: { includeCandidates?: boolean; includeLegacy?: boolean },
): TravelerMemoryObjectV1[] {
  const includeCandidates = opts?.includeCandidates !== false;
  const includeLegacy = opts?.includeLegacy !== false;
  const rows = ledger.list({ subjectId, activeOnly: false });
  const out: TravelerMemoryObjectV1[] = [];
  const seenKeys = new Set<string>();

  for (let i = rows.length - 1; i >= 0; i--) {
    const ev = rows[i];
    const isTraveler = ev.predicate.startsWith(TRAVELER_MEMORY_PREDICATE_PREFIX);
    const isLegacy =
      includeLegacy && LEGACY_PREDICATE_TO_TRAVELER_MEMORY[ev.predicate] != null;
    if (!isTraveler && !isLegacy) continue;
    if (!includeCandidates && ev.status === 'CANDIDATE') continue;
    if (
      ev.status === 'INVALIDATED' ||
      ev.status === 'REDACTED' ||
      ev.status === 'SUPERSEDED'
    ) {
      continue;
    }
    const obj = memoryEventToTravelerMemoryObject(ev);
    if (!obj) continue;
    const dedupe = `${obj.domain}:${obj.semantic_type}:${obj.key}:${obj.scope}`;
    if (seenKeys.has(dedupe)) continue;
    // 优先 traveler.* 新谓词
    if (isTraveler || !seenKeys.has(dedupe)) {
      seenKeys.add(dedupe);
      out.push(obj);
    }
  }
  return out;
}
