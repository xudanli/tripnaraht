import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildIcelandPlanningContextFixture } from '../evals/fixtures/contexts/iceland-planning.fixture';
import { buildAuthorityHarnessAnchor } from '../evals/authority/authority-context-anchor.util';
import { importProductionTraceToHarnessCase } from './production-trace-importer';
import {
  readReplaySnapshotFixture,
  readReplayTraceFixture,
  writeReplayFixtures,
} from './fixture-store.util';

describe('fixture-store.util', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-replay-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes and reads snapshot + trace fixtures', () => {
    const snapshot = buildIcelandPlanningContextFixture();
    const anchor = buildAuthorityHarnessAnchor({ tripId: snapshot.identity.tripId });
    const trace = {
      traceId: 'road_closure_test',
      capturedAt: new Date().toISOString(),
      contextId: snapshot.identity.contextId,
      inputAnchor: anchor,
      triggerType: 'WORLD_EVENT',
      anonymized: true,
    };

    const { snapshotPath, tracePath } = writeReplayFixtures({
      fixtureId: 'road_closure_test',
      snapshot,
      trace,
      baseDir: tempDir,
    });

    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.existsSync(tracePath)).toBe(true);

    const loadedSnapshot = readReplaySnapshotFixture('road_closure_test', tempDir);
    const loadedTrace = readReplayTraceFixture('road_closure_test', tempDir);

    expect(loadedSnapshot?.identity.contextId).toBe(snapshot.identity.contextId);
    expect(loadedTrace?.traceId).toBe('road_closure_test');
  });

  it('importProductionTraceToHarnessCase persists when snapshot provided', () => {
    const snapshot = buildIcelandPlanningContextFixture();
    const anchor = buildAuthorityHarnessAnchor({ tripId: snapshot.identity.tripId });

    const imported = importProductionTraceToHarnessCase(
      {
        traceId: 'persist_001',
        capturedAt: new Date().toISOString(),
        contextId: snapshot.identity.contextId,
        inputAnchor: anchor,
        triggerType: 'WORLD_EVENT',
        anonymized: true,
      },
      { snapshot, fixtureBaseDir: tempDir },
    );

    expect(readReplaySnapshotFixture(imported.fixtureId, tempDir)).not.toBeNull();
    expect(readReplayTraceFixture(imported.fixtureId, tempDir)?.traceId).toBe('persist_001');
  });
});
