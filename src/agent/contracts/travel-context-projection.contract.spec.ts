/**
 * EWP-01 — TravelContext vs corridor-local projection facts.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CURRENT_RUNTIME_SSOT,
  TARGET_CONTEXT_SSOT,
} from '../../travel-context/current-ssot-status.constants';
import { AGENT_NO_GLOBAL_CONTEXT_HASH } from './agent-conceptual-vs-actual.constants';

const ROOT = path.resolve(__dirname, '../../..');

describe('travel-context-projection.contract (EWP-01)', () => {
  it('runtime SSOT remains OS∥DSO; TravelContext is target', () => {
    expect(CURRENT_RUNTIME_SSOT).toContain('OrchestratorState');
    expect(TARGET_CONTEXT_SSOT).toContain('TravelContext');
  });

  it('no global contextHash on main chain', () => {
    expect(AGENT_NO_GLOBAL_CONTEXT_HASH).toMatch(/No unified contextHash/);
  });

  it('TravelContext snapshot types use revision / snapshotId, not contextHash', () => {
    const types = fs.readFileSync(
      path.join(ROOT, 'src/travel-context/domain/travel-context.types.ts'),
      'utf8',
    );
    expect(types).toMatch(/revision|snapshotId|basedOnRevision/);
  });

  it('Page Insight local contextHash service exists separately', () => {
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          'src/trips/copilot/services/page-insight-context-hash.service.ts',
        ),
      ),
    ).toBe(true);
  });

  it('CURRENT_SSOT_STATUS.md exists', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'src/travel-context/CURRENT_SSOT_STATUS.md')),
    ).toBe(true);
  });
});
