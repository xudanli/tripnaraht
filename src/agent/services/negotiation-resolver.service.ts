import { Injectable } from '@nestjs/common';
import { projectItineraryForNegotiationAlternative } from '../utils/negotiation-itinerary-projection.util';

type ResolveInput = {
  session_id: string;
  alternative_id: 'UPGRADE_TO_DRIVE' | 'POSTPONE_SCHEDULE';
  itinerary: any;
  negotiation_payload: any;
};

@Injectable()
export class NegotiationResolverService {
  resolve(input: ResolveInput): { itinerary: any; resolution_patch_summary: string } {
    const it = projectItineraryForNegotiationAlternative({
      itinerary: input.itinerary,
      alternative_id: input.alternative_id,
      session_id: input.session_id,
      negotiation_payload: input.negotiation_payload,
      preview: false,
    });

    const items: any[] = (it.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));

    if (input.alternative_id === 'UPGRADE_TO_DRIVE') {
      const seg = items.find((x) => x?.metadata?.resolution?.upgraded_from);
      const before = String(seg?.metadata?.resolution?.upgraded_from ?? 'TRANSIT');
      return {
        itinerary: it,
        resolution_patch_summary: `UPGRADE_TO_DRIVE: ${String(seg?.id ?? 'unknown')} ${before} -> DRIVE (id-stable)`,
      };
    }

    if (input.alternative_id === 'POSTPONE_SCHEDULE') {
      const alt = Array.isArray(input.negotiation_payload?.alternatives)
        ? input.negotiation_payload.alternatives.find((a: any) => String(a?.id ?? '') === 'POSTPONE_SCHEDULE')
        : undefined;
      const delayMin = Number(alt?.time_delta_minutes ?? 0);
      let touched = 0;
      for (const x of items) {
        if (Number.isFinite(Date.parse(String(x?.start_time ?? '')))) touched++;
        if (Number.isFinite(Date.parse(String(x?.end_time ?? '')))) touched++;
      }
      return {
        itinerary: it,
        resolution_patch_summary: `POSTPONE_SCHEDULE: +${delayMin}min applied to ${touched} time fields`,
      };
    }

    throw new Error(`NEGOTIATION_RESOLUTION: unsupported alternative_id=${String((input as any).alternative_id)}`);
  }
}

