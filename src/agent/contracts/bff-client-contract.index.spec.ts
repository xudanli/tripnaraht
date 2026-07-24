/**
 * BFF-1 — Client contract index + dual baseline pins + delta index.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  BFF_CLIENT_CONTRACT_INDEX,
  BFF_CLIENT_CONTRACT_INDEX_VERSION,
  ENGINEERING_BASELINE_COMMIT,
  FACT_PACK_OPENAPI_FREEZE_COMMIT,
  FACT_PACK_OPENAPI_GENERATION_REL,
  FACT_PACK_OPENAPI_JSON_REL,
  OPENAPI_CONTRACT_DELTA_INDEX_REL,
} from './bff-client-contract.index';

const ROOT = path.resolve(__dirname, '../../..');

describe('bff-client-contract.index (BFF-1)', () => {
  it('is versioned 1.1.0 with dual pins', () => {
    expect(BFF_CLIENT_CONTRACT_INDEX_VERSION).toBe('1.1.0');
    expect(BFF_CLIENT_CONTRACT_INDEX.length).toBeGreaterThanOrEqual(10);
    expect(FACT_PACK_OPENAPI_FREEZE_COMMIT).toBe(
      'a7e9bdca588431143e04e98d7c1c1204299c6e54',
    );
    expect(ENGINEERING_BASELINE_COMMIT).toBe(
      'bc6e2e6d5a087a6a20c47576ebdba295370ebec1',
    );
    expect(ENGINEERING_BASELINE_COMMIT).not.toBe(FACT_PACK_OPENAPI_FREEZE_COMMIT);
  });

  it('every indexed path exists in the repo', () => {
    for (const row of BFF_CLIENT_CONTRACT_INDEX) {
      expect(fs.existsSync(path.join(ROOT, row.path))).toBe(true);
    }
  });

  it('pins historical OpenAPI generation meta AND delta index to engineering baseline', () => {
    const meta = fs.readFileSync(
      path.join(ROOT, FACT_PACK_OPENAPI_GENERATION_REL),
      'utf8',
    );
    expect(meta).toContain(`git_commit=${FACT_PACK_OPENAPI_FREEZE_COMMIT}`);
    expect(fs.existsSync(path.join(ROOT, FACT_PACK_OPENAPI_JSON_REL))).toBe(true);
    const delta = fs.readFileSync(
      path.join(ROOT, OPENAPI_CONTRACT_DELTA_INDEX_REL),
      'utf8',
    );
    expect(delta.length).toBeGreaterThan(100);
    expect(delta).toMatch(/bff-client-contract\.index|route-and-run-options\.openapi\.freeze/);
  });

  it('includes Arrange dual-signal note and TravelContext HTTP surface', () => {
    const arrange = BFF_CLIENT_CONTRACT_INDEX.find((r) => r.id === 'arrange_ios');
    expect(arrange?.freshnessField).toMatch(/CONTEXT_VERSION_CONFLICT/);
    expect(
      BFF_CLIENT_CONTRACT_INDEX.some((r) => r.id === 'travel_context_http'),
    ).toBe(true);
    expect(
      BFF_CLIENT_CONTRACT_INDEX.some((r) => r.id === 'openapi_contract_delta_index'),
    ).toBe(true);
  });

  it('does not claim production client source in index notes', () => {
    const joined = BFF_CLIENT_CONTRACT_INDEX.map((r) => r.notes).join('\n');
    expect(joined).toMatch(/no in-repo Swift|Reference client|not a shipping|Internal/i);
  });
});
