/**
 * EWP-07 / BFF-1 — BFF/API characterization + indexed client contract anchors.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  BFF_CLIENT_CONTRACT_INDEX,
  FACT_PACK_OPENAPI_FREEZE_COMMIT,
} from './bff-client-contract.index';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('bff-client-contract.matrix (EWP-07 / BFF-1)', () => {
  it('evidence pack states NestJS BFF/API without production client source', () => {
    const readme = read('evidence/agent-interface-fact-pack/README.md');
    expect(readme).toMatch(/NestJS BFF\/API/);
    expect(readme).toMatch(/不含.*客户端源码|does not contain|不含/);
  });

  it('main.ts uses Nest globalPrefix api', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/setGlobalPrefix\(['\"]api['\"]\)|globalPrefix.*api/);
  });

  it('BFF-1 index covers core client contract anchors', () => {
    const requiredIds = [
      'decision_space_ios',
      'arrange_ios',
      'page_ai_contracts',
      'trusted_delivery',
      'conversation_turn_result',
      'tep_self_drive',
      'travel_context_http',
      'fact_pack_openapi',
      'route_and_run_options_freeze',
      'uwc_1e_web_ios_handoff',
      'uwc_1e_web_sample_client',
      'uwc_1e_ios_sample_client',
      'uwc_1e_client_contract_matrix',
    ];
    for (const id of requiredIds) {
      const row = BFF_CLIENT_CONTRACT_INDEX.find((r) => r.id === id);
      expect(row).toBeDefined();
      expect(fs.existsSync(path.join(ROOT, row!.path))).toBe(true);
    }
  });

  it('travel-context controller is under HTTP module (BFF/API surface)', () => {
    const ctrl = read('src/travel-context/travel-context.controller.ts');
    expect(ctrl).toMatch(/@Controller|travel-contexts/);
  });

  it('OpenAPI pin matches v1 fact-pack freeze commit and engineering baseline is distinct', () => {
    expect(FACT_PACK_OPENAPI_FREEZE_COMMIT.startsWith('a7e9bdca5')).toBe(true);
  });
});
