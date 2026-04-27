import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { CasePrecedent, CaseQuerySignature, CaseRecord } from './case-record.types';
import type { RelaxationActionId } from './constraint-scorer.util';
import { caseQuerySignatureKey } from './case-signature-key.util';
import type { CbrCaseAggregateRow, CbrRepository } from './cbr.repository';

export interface AggregatedOutcome {
  signature: CaseQuerySignature;
  total_count: number;
  /** How many samples have late acceptance (gold samples imply true, but keep generic). */
  late_accept_count: number;
  avg_wall_hit_latency_ms?: number;
  avg_wall_hit_event_span?: number;
  /** Store a few most recent evidence anchors as “bullets”. */
  evidence_anchors_top?: Array<{ evidence_id?: string; source?: string; note?: string }>;
  last_updated_at: string;
}

export interface CaseSearchQuery extends CaseQuerySignature {
  limit?: number;
}

export interface ConversionSignature {
  conflict_type: CaseQuerySignature['conflict_type'];
  primary_violation_type?: string;
  region_id?: string;
  month?: number;
}

export interface ActionConversionStats {
  action: RelaxationActionId;
  shown_count: number;
  chosen_top_count: number;
  proceeded_count: number;
  rejected_count: number;
  last_updated_at: string;
}

@Injectable()
export class LocalCaseStoreService implements OnModuleInit {
  private readonly logger = new Logger(LocalCaseStoreService.name);
  private readonly store = new Map<string, AggregatedOutcome>();
  private readonly conversion = new Map<string, Map<RelaxationActionId, ActionConversionStats>>();

  constructor(@Optional() private readonly cbrRepository?: CbrRepository) {}

  async onModuleInit(): Promise<void> {
    if (!this.cbrRepository) {
      this.logger.debug('CbrRepository not injected; skipping CBR DB preload.');
      return;
    }
    const minN = Math.max(1, parseInt(process.env.CBR_PRELOAD_MIN_TOTAL ?? '10', 10) || 10);
    const take = Math.min(Math.max(1, parseInt(process.env.CBR_PRELOAD_MAX_ROWS ?? '5000', 10) || 5000), 50_000);
    try {
      const rows = await this.cbrRepository.findAggregatesWithMinTotalCount({ minTotalCount: minN, take });
      let n = 0;
      for (const row of rows) {
        const agg = this.aggregatedOutcomeFromDbRow(row);
        this.store.set(this.signatureKey(agg.signature), agg);
        n += 1;
      }
      this.logger.log(
        `[LocalCaseStore] Successfully preloaded ${n.toLocaleString()} high-confidence cases from database (total_count >= ${minN}).`,
      );
    } catch (e) {
      this.logger.warn(
        `[LocalCaseStore] CBR preload skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private aggregatedOutcomeFromDbRow(row: CbrCaseAggregateRow): AggregatedOutcome {
    const relaxRaw = row.relaxationTypesJson;
    const relaxation_types = Array.isArray(relaxRaw) ? relaxRaw.map((x) => String(x)) : undefined;
    const anchorsRaw = row.evidenceAnchors;
    const evidenceTop =
      Array.isArray(anchorsRaw) && anchorsRaw.length > 0
        ? anchorsRaw
            .slice(0, 3)
            .map((a: { evidence_id?: unknown; source?: unknown; note?: unknown }) => ({
              evidence_id: a?.evidence_id != null ? String(a.evidence_id) : undefined,
              source: a?.source != null ? String(a.source) : undefined,
              note: a?.note != null ? String(a.note) : undefined,
            }))
        : undefined;
    return {
      signature: {
        conflict_type: row.conflictType as CaseQuerySignature['conflict_type'],
        ...(row.primaryViolationType ? { primary_violation_type: row.primaryViolationType } : {}),
        ...(row.regionId ? { region_id: row.regionId } : {}),
        ...(typeof row.month === 'number' ? { month: row.month } : {}),
        ...(relaxation_types?.length ? { relaxation_types } : {}),
      },
      total_count: row.totalCount,
      late_accept_count: row.lateAcceptCount,
      ...(typeof row.avgWallHitLatencyMs === 'number' ? { avg_wall_hit_latency_ms: row.avgWallHitLatencyMs } : {}),
      ...(typeof row.avgWallHitEventSpan === 'number' ? { avg_wall_hit_event_span: row.avgWallHitEventSpan } : {}),
      ...(evidenceTop ? { evidence_anchors_top: evidenceTop } : {}),
      last_updated_at: row.updatedAt.toISOString(),
    };
  }

  private signatureKey(sig: CaseQuerySignature): string {
    return caseQuerySignatureKey(sig);
  }

  private conversionKey(sig: ConversionSignature): string {
    return [
      `conflict=${sig.conflict_type}`,
      `vio=${sig.primary_violation_type ?? ''}`,
      `region=${sig.region_id ?? ''}`,
      `month=${sig.month ?? ''}`,
    ].join('|');
  }

  saveCase(record: CaseRecord): void {
    const sig = record.query_signature;
    const key = this.signatureKey(sig);
    const now = new Date().toISOString();
    const prev = this.store.get(key);

    const lateAccepted = (record.outcome_payload.historical_late_accept_rate ?? 1) > 0 ? 1 : 0;
    const lat = record.outcome_payload.wall_hit_distance_p90_latency_ms;
    const span = record.outcome_payload.wall_hit_distance_p90_event_span;

    const next: AggregatedOutcome = prev
      ? {
          ...prev,
          total_count: prev.total_count + 1,
          late_accept_count: prev.late_accept_count + lateAccepted,
          avg_wall_hit_latency_ms:
            typeof lat === 'number'
              ? typeof prev.avg_wall_hit_latency_ms === 'number'
                ? (prev.avg_wall_hit_latency_ms * prev.total_count + lat) / (prev.total_count + 1)
                : lat
              : prev.avg_wall_hit_latency_ms,
          avg_wall_hit_event_span:
            typeof span === 'number'
              ? typeof prev.avg_wall_hit_event_span === 'number'
                ? (prev.avg_wall_hit_event_span * prev.total_count + span) / (prev.total_count + 1)
                : span
              : prev.avg_wall_hit_event_span,
          evidence_anchors_top: this.mergeEvidence(prev.evidence_anchors_top, record.outcome_payload.evidence_anchors),
          last_updated_at: now,
        }
      : {
          signature: sig,
          total_count: 1,
          late_accept_count: lateAccepted,
          ...(typeof lat === 'number' ? { avg_wall_hit_latency_ms: lat } : {}),
          ...(typeof span === 'number' ? { avg_wall_hit_event_span: span } : {}),
          evidence_anchors_top: (record.outcome_payload.evidence_anchors ?? []).slice(0, 3),
          last_updated_at: now,
        };

    this.store.set(key, next);
  }

  private mergeEvidence(
    prev: AggregatedOutcome['evidence_anchors_top'] | undefined,
    next: Array<{ evidence_id?: string; source?: string; note?: string }> | undefined,
  ): AggregatedOutcome['evidence_anchors_top'] {
    const out: Array<{ evidence_id?: string; source?: string; note?: string }> = [];
    const seen = new Set<string>();
    for (const e of prev ?? []) {
      const k = `${e.evidence_id ?? ''}|${e.source ?? ''}|${e.note ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    for (const e of next ?? []) {
      const k = `${e.evidence_id ?? ''}|${e.source ?? ''}|${e.note ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= 3) break;
    }
    return out.length > 0 ? out : undefined;
  }

  search(query: CaseSearchQuery): CasePrecedent[] {
    const all = [...this.store.values()];

    const hardMatch = (a: AggregatedOutcome): boolean =>
      a.signature.conflict_type === query.conflict_type &&
      String(a.signature.primary_violation_type ?? '') === String(query.primary_violation_type ?? '');

    const softScore = (a: AggregatedOutcome): number => {
      let s = 0;
      if (query.region_id && a.signature.region_id === query.region_id) s += 2;
      if (typeof query.month === 'number' && a.signature.month === query.month) s += 1;
      return s;
    };

    const matches = all
      .filter(hardMatch)
      .map((a) => ({ a, score: softScore(a) }))
      .sort((x, y) => y.score - x.score);

    const limit = Math.max(1, Math.min(5, query.limit ?? 3));
    return matches.slice(0, limit).map(({ a }) => {
      const rate = a.total_count > 0 ? a.late_accept_count / a.total_count : undefined;
      const summary =
        `判例库：相似冲突已记录 N=${a.total_count}，最终接受放宽比例≈${rate !== undefined ? Math.round(rate * 100) + '%' : 'n/a'}。` +
        (typeof a.avg_wall_hit_latency_ms === 'number'
          ? `P50耗时≈${Math.round(a.avg_wall_hit_latency_ms / 1000)}s。`
          : '');
      return {
        case_id: `agg:${this.signatureKey(a.signature)}`,
        summary,
        sample_count: a.total_count,
        late_accept_count: a.late_accept_count,
        stats: {
          historical_late_accept_rate: rate,
          wall_hit_distance_p90_latency_ms: a.avg_wall_hit_latency_ms,
          wall_hit_distance_p90_event_span: a.avg_wall_hit_event_span,
        },
        evidence_anchors: a.evidence_anchors_top,
      };
    });
  }

  recordConversion(input: {
    signature: ConversionSignature;
    action: RelaxationActionId;
    kind: 'shown' | 'chosen_top' | 'proceeded' | 'rejected';
  }): void {
    const key = this.conversionKey(input.signature);
    const now = new Date().toISOString();
    const map = this.conversion.get(key) ?? new Map<RelaxationActionId, ActionConversionStats>();
    const prev = map.get(input.action);
    const base: ActionConversionStats =
      prev ??
      ({
        action: input.action,
        shown_count: 0,
        chosen_top_count: 0,
        proceeded_count: 0,
        rejected_count: 0,
        last_updated_at: now,
      } as ActionConversionStats);
    const next: ActionConversionStats = {
      ...base,
      shown_count: base.shown_count + (input.kind === 'shown' ? 1 : 0),
      chosen_top_count: base.chosen_top_count + (input.kind === 'chosen_top' ? 1 : 0),
      proceeded_count: base.proceeded_count + (input.kind === 'proceeded' ? 1 : 0),
      rejected_count: base.rejected_count + (input.kind === 'rejected' ? 1 : 0),
      last_updated_at: now,
    };
    map.set(input.action, next);
    this.conversion.set(key, map);
  }

  getPersuasionRate(input: { signature: ConversionSignature; action: RelaxationActionId }): {
    rate?: number;
    shown_count: number;
    chosen_top_count: number;
  } {
    const key = this.conversionKey(input.signature);
    const map = this.conversion.get(key);
    const s = map?.get(input.action);
    const shown = s?.shown_count ?? 0;
    const chosenTop = s?.chosen_top_count ?? 0;
    // Laplace smoothing to avoid 100% at tiny samples: (k+1)/(n+2)
    const rate = shown > 0 ? (chosenTop + 1) / (shown + 2) : undefined;
    return { rate, shown_count: shown, chosen_top_count: chosenTop };
  }

  /** For tests/observability only. */
  _debugDump(): AggregatedOutcome[] {
    return [...this.store.values()];
  }

  /** For tests/observability only. */
  _debugDumpConversions(): Array<{ signature: string; stats: ActionConversionStats[] }> {
    return [...this.conversion.entries()].map(([k, m]) => ({ signature: k, stats: [...m.values()] }));
  }
}

