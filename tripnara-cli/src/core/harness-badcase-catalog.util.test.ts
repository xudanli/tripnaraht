import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectHarnessBadcaseCatalog,
  extractBadcaseEntryFromTraceFile,
  loadBadcaseCatalog,
  searchBadcaseEntries,
} from "./harness-badcase-catalog.util";

test("extractBadcaseEntryFromTraceFile parses exported trace wrapper", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "badcase-"));
  const file = path.join(dir, "trace-req-1.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      exportedAt: "2026-06-28T00:00:00.000Z",
      trace: {
        traceId: "trace-req-1",
        requestId: "req-1",
        finalStatus: "FAILED",
        meta: { otelTraceId: "otel-abc" },
        onFailureRetrofit: { failedPhase: "VERIFY" },
        steps: [
          {
            validationResults: [{ passed: false, code: "PLAN_TOPOLOGY_GAP", severity: "L2" }],
          },
        ],
      },
    }),
  );
  const entry = extractBadcaseEntryFromTraceFile({
    traceFile: file,
    traceExportPath: "artifacts/harness-on-failure/trace-req-1.json",
  });
  assert.equal(entry.request_id, "req-1");
  assert.equal(entry.failed_phase, "VERIFY");
  assert.deepEqual(entry.violation_codes, ["PLAN_TOPOLOGY_GAP"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("collectHarnessBadcaseCatalog merges catalog on disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "badcase-collect-"));
  const exportDir = path.join(root, "traces");
  fs.mkdirSync(exportDir, { recursive: true });
  fs.writeFileSync(
    path.join(exportDir, "t1.json"),
    JSON.stringify({
      trace: {
        traceId: "t1",
        requestId: "r1",
        finalStatus: "BLOCKED",
        onFailureRetrofit: { failedPhase: "GATE_EVAL" },
        steps: [],
      },
    }),
  );
  const catalogPath = path.join(root, "catalog.json");
  const r1 = collectHarnessBadcaseCatalog({
    exportDir,
    catalogPath,
    cwd: root,
    limit: 10,
  });
  assert.equal(r1.added, 1);
  assert.equal(r1.total, 1);
  const cat = loadBadcaseCatalog(catalogPath);
  assert.ok(cat);
  const hits = searchBadcaseEntries(cat!, "GATE_EVAL");
  assert.equal(hits.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
