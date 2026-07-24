import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  alignOrchestrationStepsWithHarness,
  tryLoadHarnessTraceStepSpans,
} from './harness-orchestration-alignment.util';

describe('harness-orchestration-alignment', () => {
  it('loads step spans from exported harness trace json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-trace-'));
    const file = path.join(dir, 'trace-test.json');
    const rel = path.relative(process.cwd(), file);
    fs.writeFileSync(
      file,
      JSON.stringify({
        trace: {
          steps: [
            { step: 'GATE_EVAL', durationMs: 120, runStatus: 'PASSED' },
            { step: 'PLAN_GEN', durationMs: 4500, runStatus: 'PASSED' },
          ],
        },
      }),
    );

    const spans = tryLoadHarnessTraceStepSpans(rel);
    expect(spans).toHaveLength(2);
    expect(spans[1].duration_ms).toBe(4500);

    const aligned = alignOrchestrationStepsWithHarness(
      [
        { step: 'GATE_EVAL', status: 'COMPLETED', timestamp_ms: 1 },
        { step: 'PLAN_GEN', status: 'COMPLETED', timestamp_ms: 2 },
      ],
      { harnessTracePath: rel },
    );
    expect(aligned[0].harness_duration_ms).toBe(120);
    expect(aligned[1].harness_duration_ms).toBe(4500);

    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
});
