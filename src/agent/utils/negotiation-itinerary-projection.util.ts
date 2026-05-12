/**
 * Pure projection of a negotiation alternative onto an itinerary snapshot (no I/O).
 * Keeps item ids stable; mirrors NegotiationResolverService semantics for audit/impact previews.
 */
export function projectItineraryForNegotiationAlternative(input: {
  itinerary: any;
  alternative_id: 'UPGRADE_TO_DRIVE' | 'POSTPONE_SCHEDULE';
  session_id: string;
  negotiation_payload: any;
  preview?: boolean;
}): any {
  const it = structuredClone(input.itinerary ?? null);
  if (!it) {
    throw new Error('NEGOTIATION_PROJECTION: missing itinerary');
  }

  const items: any[] = (it.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
  const nowIso = new Date().toISOString();
  const preview = input.preview === true;

  if (input.alternative_id === 'UPGRADE_TO_DRIVE') {
    const seg = items.find((x) => {
      const t = String(x?.type ?? '').toUpperCase();
      return t === 'TRANSIT' || t === 'PUBLIC_TRANSIT' || t === 'TRANSFER';
    });
    if (!seg) {
      throw new Error('NEGOTIATION_PROJECTION: no TRANSIT/TRANSFER segment to upgrade');
    }
    const before = String(seg.type ?? '');
    seg.type = 'DRIVE';
    seg.metadata = {
      ...(seg.metadata ?? {}),
      resolution: {
        locked_by: { session_id: input.session_id, alternative_id: input.alternative_id, resolved_at: nowIso },
        evidence_refs: Object.keys(input.negotiation_payload?.evidence_lineage ?? {}),
        upgraded_from: before,
        ...(preview ? { projection_preview: true } : {}),
      },
    };
    return it;
  }

  if (input.alternative_id === 'POSTPONE_SCHEDULE') {
    const alt = Array.isArray(input.negotiation_payload?.alternatives)
      ? input.negotiation_payload.alternatives.find((a: any) => String(a?.id ?? '') === 'POSTPONE_SCHEDULE')
      : undefined;
    const delayMin = Number(alt?.time_delta_minutes ?? 0);
    if (!Number.isFinite(delayMin) || delayMin <= 0) {
      throw new Error('NEGOTIATION_PROJECTION: invalid postpone delay');
    }

    let touched = 0;
    for (const x of items) {
      const st = x?.start_time ? Date.parse(String(x.start_time)) : NaN;
      const et = x?.end_time ? Date.parse(String(x.end_time)) : NaN;
      if (Number.isFinite(st)) {
        x.start_time = new Date(st + delayMin * 60_000).toISOString();
        touched++;
      }
      if (Number.isFinite(et)) {
        x.end_time = new Date(et + delayMin * 60_000).toISOString();
        touched++;
      }
      x.metadata = {
        ...(x.metadata ?? {}),
        resolution: {
          ...(x.metadata?.resolution ?? {}),
          locked_by: { session_id: input.session_id, alternative_id: input.alternative_id, resolved_at: nowIso },
          applied_delay_minutes: delayMin,
          ...(preview ? { projection_preview: true } : {}),
        },
      };
    }
    if (touched === 0) {
      throw new Error('NEGOTIATION_PROJECTION: postpone touched no time fields');
    }
    return it;
  }

  throw new Error(`NEGOTIATION_PROJECTION: unsupported alternative_id=${String((input as any).alternative_id)}`);
}
