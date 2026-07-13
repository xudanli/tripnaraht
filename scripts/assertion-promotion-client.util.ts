/**
 * Fire-and-forget client — :3000 collector → :3002 assertion promotion.
 */

export interface AssertionPromotionFireInput {
  tripId: string;
  signal: 'ASSERTION_EMITTED' | 'RECOVERY_OBSERVED';
  predicate: 'weather.hazard' | 'road.status';
  dayIndex?: number;
  roadId?: string;
  riskTier?: 'CALM' | 'ELEVATED' | 'PROHIBITED';
  assertionId?: string;
  eventId?: string;
  ingestId?: string;
  sourceProvider?: string;
}

export async function fireAssertionPromotion(
  input: AssertionPromotionFireInput,
): Promise<void> {
  if (process.env.ASSERTION_PROMOTION_ENABLED !== '1') {
    return;
  }
  const baseUrl = process.env.ASSERTION_PROMOTION_BASE_URL?.trim() || 'http://127.0.0.1:3002';
  const secret = process.env.ASSERTION_PROMOTION_INTERNAL_SECRET?.trim();
  if (!secret) {
    console.warn('[assertion-promotion-client] ASSERTION_PROMOTION_INTERNAL_SECRET unset — skip');
    return;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/internal/monitoring/promote-assertion`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-assertion-promotion-secret': secret,
      },
      body: JSON.stringify({
        ...input,
        trigger: 'collector_ingest',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[assertion-promotion-client] http=${res.status} body=${text.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[assertion-promotion-client] failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function mapVedurCanonicalToPromotionFire(input: {
  tripId: string;
  dayIndex: number;
  outcome: 'SILENT' | 'ASSERTION_EMITTED' | 'STORED';
  riskTier?: 'CALM' | 'ELEVATED' | 'PROHIBITED';
  assertionId?: string;
  eventId?: string;
  ingestId?: string;
}): AssertionPromotionFireInput | null {
  if (input.outcome === 'ASSERTION_EMITTED') {
    if (input.riskTier === 'CALM') {
      return {
        tripId: input.tripId,
        signal: 'RECOVERY_OBSERVED',
        predicate: 'weather.hazard',
        dayIndex: input.dayIndex,
        riskTier: 'CALM',
        assertionId: input.assertionId,
        eventId: input.eventId,
        ingestId: input.ingestId,
        sourceProvider: 'iceland_met',
      };
    }
    return {
      tripId: input.tripId,
      signal: 'ASSERTION_EMITTED',
      predicate: 'weather.hazard',
      dayIndex: input.dayIndex,
      assertionId: input.assertionId,
      eventId: input.eventId,
      ingestId: input.ingestId,
      riskTier: input.riskTier,
      sourceProvider: 'iceland_met',
    };
  }
  if (input.outcome === 'SILENT' && input.riskTier === 'CALM') {
    return {
      tripId: input.tripId,
      signal: 'RECOVERY_OBSERVED',
      predicate: 'weather.hazard',
      dayIndex: input.dayIndex,
      riskTier: 'CALM',
      ingestId: input.ingestId,
      sourceProvider: 'iceland_met',
    };
  }
  return null;
}
