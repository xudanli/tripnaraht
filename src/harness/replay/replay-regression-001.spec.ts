import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildIcelandRoadClosureReadyFixture } from '../evals/fixtures/contexts/iceland-road-closure-ready.fixture';
import { buildAuthorityHarnessAnchor } from '../evals/authority/authority-context-anchor.util';
import {
  assertReplanRoadClosure001,
  simulateRoadClosureReplanning,
} from '../evals/replanning/replanning.util';
import { importProductionTraceToHarnessCase } from './production-trace-importer';
import {
  replayProductionTraceFromFixtures,
  replayProductionTraceHarness,
} from './replay-runner';
import { harnessAssert } from '../protocol/run-travel-context-harness.util';

describe('REPLAY-REGRESSION-001 — production trace → fixture → replay E2E', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-replay-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('imports trace, persists fixtures, replays road-closure regression', async () => {
    const snapshot = buildIcelandRoadClosureReadyFixture();
    const anchor = buildAuthorityHarnessAnchor({
      tripId: snapshot.identity.tripId,
      runtimeAuthority: 'CANONICAL',
    });

    const replan = simulateRoadClosureReplanning({
      snapshot,
      event: {
        type: 'ROAD_CLOSED',
        roadId: 'IS-F208',
        observedAt: '2026-07-05T10:00:00Z',
        sourceId: 'road-authority-is',
      },
      authorizationPolicy: { roadClosure: 'ASK_BEFORE_APPLY' },
      authorityRunId: 'replay-regression-001',
    });

    const trace = {
      traceId: 'road_closure_20260705_001',
      capturedAt: '2026-07-05T10:05:00.000Z',
      contextId: snapshot.identity.contextId,
      inputAnchor: {
        ...anchor,
        inputRevision: snapshot.meta.revision,
        inputSnapshotId: snapshot.meta.snapshotId,
      },
      outputAnchor: {
        ...anchor,
        inputRevision: snapshot.meta.revision,
        outputRevision: replan.outputSnapshot.meta.revision,
        outputSnapshotId: replan.outputSnapshot.meta.snapshotId,
        changedDomains: replan.changedDomains,
      },
      triggerType: 'WORLD_EVENT',
      anonymized: true,
    };

    const imported = importProductionTraceToHarnessCase(trace, {
      snapshot,
      fixtureBaseDir: tempDir,
    });

    const fromFixtures = await replayProductionTraceFromFixtures({
      fixtureId: imported.fixtureId,
      fixtureBaseDir: tempDir,
      outputSnapshot: replan.outputSnapshot,
      runAssertions: async () => [
        ...assertReplanRoadClosure001(snapshot, replan),
        harnessAssert({
          name: 'regression_case_id_format',
          pass: imported.harnessCase.caseId.startsWith('REGRESSION-'),
          expected: 'REGRESSION-*',
          actual: imported.harnessCase.caseId,
        }),
      ],
    });

    expect(fromFixtures).not.toBeNull();
    expect(fromFixtures!.pass).toBe(true);
    expect(fromFixtures!.harnessCaseId).toBe(imported.harnessCase.caseId);
  });

  it('replayProductionTraceHarness validates invariants on output snapshot', async () => {
    const snapshot = buildIcelandRoadClosureReadyFixture();
    const anchor = buildAuthorityHarnessAnchor({ tripId: snapshot.identity.tripId });
    const replan = simulateRoadClosureReplanning({
      snapshot,
      event: {
        type: 'ROAD_CLOSED',
        roadId: 'IS-F208',
        observedAt: '2026-07-05T10:00:00Z',
        sourceId: 'road-authority-is',
      },
      authorityRunId: 'replay-inline',
    });

    const trace = {
      traceId: 'inline_replay_001',
      capturedAt: new Date().toISOString(),
      contextId: snapshot.identity.contextId,
      inputAnchor: {
        ...anchor,
        inputRevision: snapshot.meta.revision,
        inputSnapshotId: snapshot.meta.snapshotId,
      },
      outputAnchor: {
        ...anchor,
        outputRevision: replan.outputSnapshot.meta.revision,
        outputSnapshotId: replan.outputSnapshot.meta.snapshotId,
      },
      triggerType: 'WORLD_EVENT',
      anonymized: true,
    };

    const result = await replayProductionTraceHarness({
      trace,
      snapshot,
      outputSnapshot: replan.outputSnapshot,
      runAssertions: async () => assertReplanRoadClosure001(snapshot, replan),
    });

    expect(result.pass).toBe(true);
    expect(result.invariantResults?.every((i) => i.pass)).toBe(true);
  });
});
