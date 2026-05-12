import { Injectable } from '@nestjs/common';

/** Structured delta for revision V_n → V_{n+1} (narrative + indexed query). */
export type ItineraryRevisionAuditDelta = {
  delta_cost_usd: number | null;
  delta_time_minutes: number | null;
  interrupted_items: Array<{ item_id: string; field: string }>;
  /** Mirrors alternative_id for timeline filters. */
  resolution_type: string;
};

function flattenItems(snapshot: any): any[] {
  const days: any[] = Array.isArray(snapshot?.days) ? snapshot.days : [];
  const out: any[] = [];
  for (const d of days) {
    const items = Array.isArray(d?.items) ? d.items : [];
    out.push(...items);
  }
  return out;
}

function itemKey(it: any): string {
  return String(it?.id ?? it?.item_id ?? '').trim() || `anon:${JSON.stringify(it?.start_time ?? '')}`;
}

/**
 * Quantifies physical / schedule delta between parent and child snapshots.
 * For POSTPONE_SCHEDULE, authoritative delay comes from negotiation_payload.alternatives[].time_delta_minutes.
 */
@Injectable()
export class AuditRecordService {
  computeRevisionAuditDelta(params: {
    parentSnapshot: any;
    childSnapshot: any;
    alternativeId: string;
    negotiationPayload?: any;
  }): ItineraryRevisionAuditDelta {
    const resolution_type = String(params.alternativeId ?? '').trim() || 'UNKNOWN';
    let delta_cost_usd: number | null = null;
    let delta_time_minutes: number | null = null;

    const alts = params.negotiationPayload?.alternatives;
    if (params.alternativeId === 'POSTPONE_SCHEDULE') {
      const postpone = Array.isArray(alts) ? alts.find((a: any) => String(a?.id ?? '') === 'POSTPONE_SCHEDULE') : undefined;
      const dm = Number(postpone?.time_delta_minutes);
      if (Number.isFinite(dm)) delta_time_minutes = Math.round(dm);
      const c = Number(postpone?.cost_delta_usd);
      if (Number.isFinite(c)) delta_cost_usd = c;
    } else if (params.alternativeId === 'UPGRADE_TO_DRIVE') {
      const drive = Array.isArray(alts) ? alts.find((a: any) => String(a?.id ?? '') === 'UPGRADE_TO_DRIVE') : undefined;
      const c = Number(drive?.cost_delta_usd);
      if (Number.isFinite(c)) delta_cost_usd = c;
      delta_time_minutes = this.computeMedianStartShiftMinutes(params.parentSnapshot, params.childSnapshot);
    }

    const interrupted_items = this.listInterruptedItems(params.parentSnapshot, params.childSnapshot);
    return {
      delta_cost_usd,
      delta_time_minutes,
      interrupted_items,
      resolution_type,
    };
  }

  /**
   * Rollback audit: expresses schedule change from current head → target as negative median start shift
   * (relative to “moving time backwards” when target is earlier than head).
   */
  computeRollbackAuditDelta(headSnapshot: any, targetSnapshot: any): ItineraryRevisionAuditDelta {
    const fwd = this.computeMedianStartShiftMinutes(targetSnapshot, headSnapshot);
    const delta_time_minutes = fwd != null ? -fwd : null;
    const interrupted_items = this.listInterruptedItems(headSnapshot, targetSnapshot);
    return {
      delta_cost_usd: null,
      delta_time_minutes,
      interrupted_items,
      resolution_type: 'ROLLBACK',
    };
  }

  /** Heuristic: median (child.start - parent.start) in minutes across matched items. */
  computeMedianStartShiftMinutes(parent: any, child: any): number | null {
    const diffs: number[] = [];
    const pMap = new Map<string, any>();
    for (const it of flattenItems(parent)) {
      const k = itemKey(it);
      if (k.startsWith('anon:')) continue;
      pMap.set(k, it);
    }
    for (const cIt of flattenItems(child)) {
      const k = itemKey(cIt);
      const pIt = pMap.get(k);
      if (!pIt) continue;
      const ps = typeof pIt?.start_time === 'string' ? Date.parse(pIt.start_time) : NaN;
      const cs = typeof cIt?.start_time === 'string' ? Date.parse(cIt.start_time) : NaN;
      if (Number.isFinite(ps) && Number.isFinite(cs)) {
        diffs.push(Math.round((cs - ps) / 60_000));
      }
    }
    if (!diffs.length) return null;
    diffs.sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)] ?? null;
    if (med === 0 && diffs.every((d) => d === 0)) return null;
    return med;
  }

  listInterruptedItems(parent: any, child: any): Array<{ item_id: string; field: string }> {
    const out: Array<{ item_id: string; field: string }> = [];
    const pMap = new Map<string, any>();
    for (const it of flattenItems(parent)) {
      const k = itemKey(it);
      if (!k.startsWith('anon:')) pMap.set(k, it);
    }
    for (const cIt of flattenItems(child)) {
      const k = itemKey(cIt);
      if (k.startsWith('anon:')) continue;
      const pIt = pMap.get(k);
      if (!pIt) continue;
      const fields = ['start_time', 'end_time'] as const;
      for (const f of fields) {
        if (String(pIt?.[f] ?? '') !== String(cIt?.[f] ?? '')) {
          out.push({ item_id: k, field: f });
          break;
        }
      }
    }
    return out;
  }
}
