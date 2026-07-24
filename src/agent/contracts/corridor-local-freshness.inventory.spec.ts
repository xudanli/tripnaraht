/**
 * CTX-1 — Corridor-local freshness inventory contract.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_NO_GLOBAL_CONTEXT_HASH } from './agent-conceptual-vs-actual.constants';
import {
  CORRIDOR_LOCAL_FRESHNESS_INVENTORY,
  CORRIDOR_LOCAL_FRESHNESS_INVENTORY_VERSION,
  GLOBAL_TRAVEL_CONTEXT_SSOT_WIRE_FORBIDDEN,
} from './corridor-local-freshness.inventory';
import {
  CURRENT_RUNTIME_SSOT,
  TARGET_CONTEXT_SSOT,
} from '../../travel-context/current-ssot-status.constants';

const ROOT = path.resolve(__dirname, '../../..');

describe('corridor-local-freshness.inventory (CTX-1)', () => {
  it('is versioned and forbids global TravelContext SSOT wire', () => {
    expect(CORRIDOR_LOCAL_FRESHNESS_INVENTORY_VERSION).toBe('1.0.0');
    expect(GLOBAL_TRAVEL_CONTEXT_SSOT_WIRE_FORBIDDEN).toMatch(/Do not wire TravelContext/);
    expect(CURRENT_RUNTIME_SSOT).toContain('OrchestratorState');
    expect(TARGET_CONTEXT_SSOT).toContain('TravelContext');
  });

  it('documents no unified main-chain contextHash', () => {
    const main = CORRIDOR_LOCAL_FRESHNESS_INVENTORY.find(
      (r) => r.id === 'route_and_run_main_chain',
    );
    expect(main?.staleOrConflictSignal).toBe(AGENT_NO_GLOBAL_CONTEXT_HASH);
  });

  it('every anchor path exists', () => {
    for (const row of CORRIDOR_LOCAL_FRESHNESS_INVENTORY) {
      expect(fs.existsSync(path.join(ROOT, row.anchorPath))).toBe(true);
    }
  });

  it('covers Arrange dual-signal, TEP STALE_REPAIR_OPTION, Mobile ifMatch, Page Insight hash', () => {
    const ids = CORRIDOR_LOCAL_FRESHNESS_INVENTORY.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'arrange_itinerary',
        'tep_repair_apply',
        'mobile_spatial_planning',
        'page_insight',
        'travel_context',
      ]),
    );
    const arrange = CORRIDOR_LOCAL_FRESHNESS_INVENTORY.find(
      (r) => r.id === 'arrange_itinerary',
    );
    expect(arrange?.staleOrConflictSignal).toContain('CONTEXT_STALE');
    expect(arrange?.staleOrConflictSignal).toContain('CONTEXT_VERSION_CONFLICT');
    const tep = CORRIDOR_LOCAL_FRESHNESS_INVENTORY.find((r) => r.id === 'tep_repair_apply');
    expect(tep?.staleOrConflictSignal).toBe('STALE_REPAIR_OPTION');
  });

  it('does not invent a single global freshness field name across corridors', () => {
    const fieldSets = CORRIDOR_LOCAL_FRESHNESS_INVENTORY.map((r) => r.fields.join('|'));
    const unique = new Set(fieldSets);
    expect(unique.size).toBe(CORRIDOR_LOCAL_FRESHNESS_INVENTORY.length);
  });
});
