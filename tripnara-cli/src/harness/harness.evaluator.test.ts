import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHarnessResult,
  inferRiskScoreHintFromQuery,
  nominalRiskForExpectedVerdict,
} from "./harness.evaluator";
import type { HarnessCase } from "./harness.types";

test("inferRiskScoreHintFromQuery: storm → 0.6", () => {
  assert.equal(inferRiskScoreHintFromQuery("上海暴雨，户外"), 0.6);
});

test("buildHarnessResult: verdict mismatch fails", () => {
  const c: HarnessCase = {
    id: "x",
    query: "q",
    expected: { verdict: "ALLOW" },
  };
  const r = buildHarnessResult(c, { verdict: "REJECT", riskScore: 0.9 });
  assert.equal(r.pass, false);
  assert.ok(r.errors.some((e) => e.includes("Verdict mismatch")));
});

test("nominalRiskForExpectedVerdict", () => {
  assert.equal(nominalRiskForExpectedVerdict("CLARIFY"), 0.47);
});
