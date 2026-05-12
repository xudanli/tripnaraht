import { Injectable } from '@nestjs/common';

type NegotiationSessionRecord = {
  session_id: string;
  expected_negotiation_hash: string;
  negotiation_payload: any;
  itinerary: any;
  request?: any;
  created_at_ms: number;
  expires_at_ms: number;
};

@Injectable()
export class NegotiationSessionStoreService {
  private readonly store = new Map<string, NegotiationSessionRecord>();
  private readonly DEFAULT_TTL_MS = 15 * 60_000;

  set(input: {
    session_id: string;
    expected_negotiation_hash: string;
    negotiation_payload: any;
    itinerary: any;
    request?: any;
    ttl_ms?: number;
  }): void {
    const now = Date.now();
    const ttl = typeof input.ttl_ms === 'number' && Number.isFinite(input.ttl_ms) ? Math.max(5_000, input.ttl_ms) : this.DEFAULT_TTL_MS;
    this.store.set(input.session_id, {
      session_id: input.session_id,
      expected_negotiation_hash: input.expected_negotiation_hash,
      negotiation_payload: input.negotiation_payload,
      itinerary: input.itinerary,
      request: input.request,
      created_at_ms: now,
      expires_at_ms: now + ttl,
    });
  }

  get(session_id: string): NegotiationSessionRecord | undefined {
    const rec = this.store.get(session_id);
    if (!rec) return undefined;
    if (Date.now() > rec.expires_at_ms) {
      this.store.delete(session_id);
      return undefined;
    }
    return rec;
  }

  delete(session_id: string): void {
    this.store.delete(session_id);
  }
}

