/**
 * Case 5 — Lifeline Challenge: synthetic `research_data.safetravel_alerts` for itinerary.verify.
 * Align `affected_route_segment_refs[]` with `ItineraryItem.metadata.route_segment_ref` on DRIVE/TRANSIT legs.
 */

export interface SafetravelRouteAlertEvidence {
  id?: string;
  /** e.g. safetravel.is RSS */
  source?: string;
  title?: string;
  /** Alert body (RSS description or gate summary) */
  summary: string;
  /** Must match `metadata.route_segment_ref` on affected legs */
  affected_route_segment_refs: string[];
  /**
   * `critical` → verify severity CRITICAL (lifeline / hard closure).
   * Other values → ERROR or WARNING at verify discretion.
   */
  severity?: string;
}

export function createSafeTravelEvidence(
  overrides?: Partial<{
    summary: string;
    segmentRef: string;
    severity: string;
    title: string;
    source: string;
    id: string;
  }>,
): { safetravel_alerts: SafetravelRouteAlertEvidence[] } {
  const segmentRef = overrides?.segmentRef ?? 'ring-road:vik-jokulsarlon';
  const summary =
    overrides?.summary ??
    'Road 1 CLOSED between Vík and Jökulsárlón due to extreme winds.';
  return {
    safetravel_alerts: [
      {
        id: overrides?.id ?? 'safetravel-case5-lifeline',
        source: overrides?.source ?? 'safetravel.is',
        title: overrides?.title ?? 'SafeTravel — Road conditions',
        summary,
        affected_route_segment_refs: [segmentRef],
        severity: overrides?.severity ?? 'critical',
      },
    ],
  };
}
