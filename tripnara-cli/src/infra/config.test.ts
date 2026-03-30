import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "./config";

test("getConfig reads env vars", () => {
  process.env.TRIPNARA_DEBUG = "1";
  process.env.TRIPNARA_LLM_PROVIDER = "openai";
  process.env.TRIPNARA_API_BASE = "http://localhost:3000";
  process.env.TRIPNARA_API_TOKEN = "t";

  const c = getConfig();
  assert.equal(c.debug, true);
  assert.equal(c.llmProvider, "openai");
  assert.equal(c.apiBase, "http://localhost:3000");
  assert.equal(c.apiToken, "t");
});
