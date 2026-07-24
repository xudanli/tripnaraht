/**
 * RB-1 — Rollback corridor product labels (facts / contract SSOT).
 * Not a cross-product compensation bus.
 */

export const ROLLBACK_CORRIDOR_PRODUCT_CONSTANTS_VERSION = '1.0.0' as const;

/** Unified Decision — real HTTP rollback entry (globalPrefix api). */
export const UNIFIED_ROLLBACK_HTTP_ENTRY =
  'POST /api/trips/:tripId/decisions/:decisionId/rollback' as const;

export const UNIFIED_ROLLBACK_CONTROLLER_ROUTE =
  "Post('decisions/:decisionId/rollback')" as const;

/**
 * Actions Commit rollback — product stub until an explicit product decision
 * upgrades it. HTTP 200 does **not** reverse commits or side effects.
 */
export const ACTIONS_ROLLBACK_PRODUCT_STATUS = 'STUB_NO_SIDE_EFFECTS' as const;

export const ACTIONS_ROLLBACK_STUB_MESSAGE =
  'Rollback accepted (stub, no side effects).' as const;

export const ACTIONS_ROLLBACK_PRODUCT_LABEL =
  'POST /api/agent/actions/rollback is a product stub: accepts request, applies no compensating writes' as const;

export const ACTIONS_ROLLBACK_HTTP_ENTRY = 'POST /api/agent/actions/rollback' as const;
