/**
 * EWP-07 — BFF/API characterization + backend-defined client contract anchors.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('bff-client-contract.matrix (EWP-07)', () => {
  it('evidence pack states NestJS BFF/API without production client source', () => {
    const readme = read('evidence/agent-interface-fact-pack/README.md');
    expect(readme).toMatch(/NestJS BFF\/API/);
    expect(readme).toMatch(/不含.*客户端源码|does not contain|不含/);
  });

  it('main.ts uses Nest globalPrefix api', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/setGlobalPrefix\(['\"]api['\"]\)|globalPrefix.*api/);
  });

  it('client contract matrix anchors exist', () => {
    const anchors = [
      'src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md',
      'src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md',
      'src/trips/copilot/contracts/page-ai-contracts.ts',
      'src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md',
      'src/travel-context/travel-context.controller.ts',
      'internal-docs/frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md',
    ];
    for (const rel of anchors) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  it('travel-context controller is under HTTP module (BFF/API surface)', () => {
    const ctrl = read('src/travel-context/travel-context.controller.ts');
    expect(ctrl).toMatch(/@Controller|travel-contexts/);
  });
});
