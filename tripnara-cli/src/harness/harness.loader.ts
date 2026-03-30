import fs from "fs";
import path from "path";
import type { HarnessCase, Verdict } from "./harness.types";

const VERDICTS: Verdict[] = ["ALLOW", "REJECT", "ADJUST", "CLARIFY"];

function isVerdict(v: unknown): v is Verdict {
  return typeof v === "string" && VERDICTS.includes(v as Verdict);
}

export function loadCases(filePath: string): HarnessCase[] {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`Harness cases file must be a JSON array: ${resolved}`);
  }
  const cases: HarnessCase[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as Record<string, unknown>;
    if (!row || typeof row.id !== "string" || typeof row.query !== "string") {
      throw new Error(`Invalid case at index ${i}: need id, query`);
    }
    const exp = row.expected as Record<string, unknown> | undefined;
    if (!exp || !isVerdict(exp.verdict)) {
      throw new Error(`Invalid case ${row.id}: expected.verdict must be a Verdict`);
    }
    const c: HarnessCase = {
      id: row.id,
      query: row.query,
      expected: {
        verdict: exp.verdict,
        ...(typeof exp.maxRisk === "number" ? { maxRisk: exp.maxRisk } : {}),
      },
    };
    if (typeof row.riskScoreHint === "number") c.riskScoreHint = row.riskScoreHint;
    if (typeof row.expectedRisk === "number") c.expectedRisk = row.expectedRisk;
    if (typeof row.reason === "string") c.reason = row.reason;
    if (typeof row.days === "number") c.days = row.days;
    cases.push(c);
  }
  return cases;
}
