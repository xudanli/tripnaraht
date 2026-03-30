import test from "node:test";
import assert from "node:assert/strict";
import { callRouteAndRun } from "./api-client";
import { CliError } from "../infra/errors";

function mockFetch(fn: typeof globalThis.fetch): () => void {
  const prev = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = prev;
  };
}

test("callRouteAndRun extracts verdict/gate/risk summary", async () => {
  const restore = mockFetch(async () => {
    const body = {
      explain: {
        decision_log: [{ step: "VERIFY" }],
        simplified_explanation: { risk_tags_summary: [{ tag: "SAFETY", count: 2 }] },
        ai_capability_display: {
          confidence: { overall: 0.8, gate_evaluation: 0.9, plan_generation: 0.7 },
          limitations: [{ type: "UNCERTAINTY", description: "x", impact: "HIGH" }],
        },
      },
      result: {
        payload: {
          orchestrationResult: {
            state: { verdict: "ADJUST", gate_result: { gate_result: "ADJUST_REQUIRED" } },
          },
        },
      },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  try {
    const out = await callRouteAndRun("http://localhost:3000", undefined, {});
    assert.equal(out.verdict, "ADJUST");
    assert.equal(out.gate_result, "ADJUST_REQUIRED");
    assert.equal(out.risk_tags_summary?.[0].tag, "SAFETY");
    assert.equal(out.decision_steps?.[0], "VERIFY");
    assert.equal(out.confidence?.overall, 0.8);
  } finally {
    restore();
  }
});

test("callRouteAndRun reads gate_result from orchestrationResult when state omits it", async () => {
  const restore = mockFetch(async () => {
    const body = {
      explain: {},
      result: {
        payload: {
          orchestrationResult: {
            state: { verdict: "ALLOW" },
            gate_result: { gate_result: "BLOCK", violations: [], evidence_refs: [] },
          },
        },
      },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  try {
    const out = await callRouteAndRun("http://localhost:3000", undefined, {});
    assert.equal(out.gate_result, "BLOCK");
    assert.equal(out.verdict, "ALLOW");
  } finally {
    restore();
  }
});

test("callRouteAndRun posts to /api/agent/route_and_run (Nest contract)", async () => {
  let calledUrl = "";
  const restore = mockFetch(async (input: RequestInfo | URL) => {
    calledUrl = typeof input === "string" ? input : input.toString();
    return new Response(JSON.stringify({ explain: {}, result: {} }), { status: 200 });
  });
  try {
    await callRouteAndRun("http://localhost:3000/", undefined, {});
    assert.ok(
      calledUrl.endsWith("/api/agent/route_and_run"),
      `expected path route_and_run, got: ${calledUrl}`,
    );
  } finally {
    restore();
  }
});

test("callRouteAndRun extracts result_status, answer_text, orchestration_errors", async () => {
  const restore = mockFetch(async () => {
    const body = {
      explain: { decision_log: [] },
      result: {
        status: "FAILED",
        answer_text: "transport failed",
        payload: {
          orchestrationResult: {
            state: {
              verdict: "CLARIFY",
              errors: [
                {
                  step: "FAILED",
                  error_code: "ORCHESTRATION_ERROR",
                  message: "Critical skill failed",
                },
              ],
            },
          },
        },
      },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  try {
    const out = await callRouteAndRun("http://localhost:3000", undefined, {});
    assert.equal(out.result_status, "FAILED");
    assert.equal(out.answer_text, "transport failed");
    assert.equal(out.orchestration_errors?.[0]?.error_code, "ORCHESTRATION_ERROR");
    assert.equal(out.orchestration_errors?.[0]?.message, "Critical skill failed");
  } finally {
    restore();
  }
});

test("callRouteAndRun maps 401 to AUTH_FAILED", async () => {
  const restore = mockFetch(async () => new Response("unauthorized", { status: 401 }));
  try {
    await assert.rejects(
      () => callRouteAndRun("http://localhost:3000", undefined, {}),
      (err: unknown) =>
        err instanceof CliError && err.code === "AUTH_FAILED",
    );
  } finally {
    restore();
  }
});
