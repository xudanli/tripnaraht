/**
 * In-memory (+ optional JSONL) store for WM Outcome Validation records.
 * Tick-scoped evidence ledger — not a World SSOT.
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { Injectable } from '@nestjs/common';
import type { WmOutcomeValidationRecord } from './wm-outcome-validation.types';

@Injectable()
export class WmOutcomeValidationStore {
  private readonly byTrip = new Map<string, WmOutcomeValidationRecord[]>();

  /**
   * Upsert by tickId within a trip (outcome backfill replaces provisional accept).
   */
  put(record: WmOutcomeValidationRecord): WmOutcomeValidationRecord {
    const list = this.byTrip.get(record.tripId) ?? [];
    const idx = list.findIndex((r) => r.tickId === record.tickId);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this.byTrip.set(record.tripId, list);
    return record;
  }

  list(tripId: string): WmOutcomeValidationRecord[] {
    return [...(this.byTrip.get(tripId) ?? [])];
  }

  latest(tripId: string): WmOutcomeValidationRecord | undefined {
    const list = this.list(tripId);
    return list.length ? list[list.length - 1] : undefined;
  }

  findByTickId(
    tripId: string,
    tickId: string,
  ): WmOutcomeValidationRecord | undefined {
    return this.list(tripId).find((r) => r.tickId === tickId);
  }

  clear(tripId?: string): void {
    if (tripId) this.byTrip.delete(tripId);
    else this.byTrip.clear();
  }

  /**
   * Append JSONL for offline Trip review.
   * Default path: .tmp/wm-outcome-validation/<tripId>.jsonl
   */
  appendJsonl(
    record: WmOutcomeValidationRecord,
    baseDir = join(process.cwd(), '.tmp', 'wm-outcome-validation'),
  ): string {
    const file = join(baseDir, `${record.tripId}.jsonl`);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    return file;
  }
}
