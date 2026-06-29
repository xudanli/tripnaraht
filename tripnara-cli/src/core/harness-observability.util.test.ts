import test from "node:test";
import assert from "node:assert/strict";
import {
  extractHarnessTraceObservability,
  formatHarnessTraceObservabilityLine,
} from "./harness-observability.util";

test("extractHarnessTraceObservability reads observability slice", () => {
  const slice = extractHarnessTraceObservability({
    request_id: "req-1",
    meta: { run_id: "run-1" },
    observability: {
      harness_active_trace_id: "tr-abc",
      harness_trace_export_path: "artifacts/harness-on-failure/tr-abc.json",
      evaluation_run_id: "eval-1",
    },
  });
  assert.equal(slice.harness_active_trace_id, "tr-abc");
  assert.equal(slice.harness_trace_export_path, "artifacts/harness-on-failure/tr-abc.json");
  assert.equal(slice.run_id, "run-1");
  assert.match(formatHarnessTraceObservabilityLine(slice), /export=artifacts/);
});
