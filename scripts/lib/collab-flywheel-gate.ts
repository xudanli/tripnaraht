import { compareCollaborativeFlywheelFingerprints } from '../../src/match-square/observability/collaborative-flywheel-replay-audit.util';
import {
  buildCollabFlywheelGateFixture,
  COLLAB_FLYWHEEL_GATE_FIXTURE_ID,
} from '../../src/match-square/observability/collaborative-flywheel-gate.fixture';

export type CollabFlywheelGateResult = {
  id: string;
  ok: boolean;
  diff: string[];
};

export type CollabFlywheelGateSummary = {
  passed: number;
  failed: number;
  results: CollabFlywheelGateResult[];
};

export function runCollabFlywheelGate(): CollabFlywheelGateSummary {
  const results: CollabFlywheelGateResult[] = [];

  const fixture = buildCollabFlywheelGateFixture();
  const audit = compareCollaborativeFlywheelFingerprints(fixture);
  const diff: string[] = [];

  if (!audit.match) {
    for (const a of audit.assertions) {
      if (!a.passed) diff.push(`${a.id}: ${a.message}`);
    }
  }

  results.push({
    id: COLLAB_FLYWHEEL_GATE_FIXTURE_ID,
    ok: audit.match,
    diff,
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return { passed, failed, results };
}
