import type { HarnessCase, HarnessResult } from "./harness.types";
import { averageRiskError } from "./harness.evaluator";

function caseById(cases: HarnessCase[], id: string): HarnessCase | undefined {
  return cases.find((c) => c.id === id);
}

export function printReport(
  results: HarnessResult[],
  options?: { verbose?: boolean; cases?: HarnessCase[] },
): void {
  const verbose = options?.verbose ?? false;
  const cases = options?.cases ?? [];
  let passCount = 0;

  for (const r of results) {
    const c = caseById(cases, r.id);
    if (r.pass) {
      passCount++;
      console.log(`Case ${r.id}: ✅ PASS`);
      if (verbose) {
        console.log(`  verdict=${r.actual.verdict} risk=${r.actual.riskScore.toFixed(2)}`);
      }
      continue;
    }

    console.log(`Case ${r.id}: ❌ FAIL`);
    console.log(`Expected: ${r.expected.verdict}`);
    console.log(`Actual:   ${r.actual.verdict}`);
    if (r.riskDelta !== undefined) {
      const sign = r.riskDelta >= 0 ? "+" : "";
      console.log(`RiskΔ:    ${sign}${r.riskDelta.toFixed(2)}`);
    }
    const reasonLine = c?.reason ?? r.actual.reason;
    if (reasonLine) {
      console.log(`Reason:   ${reasonLine}`);
    }
    if (r.errors.length > 0) {
      console.log(`Errors:   ${r.errors.join("; ")}`);
    }
    if (verbose) {
      console.log(
        `  riskScore actual=${r.actual.riskScore.toFixed(3)} expectedVerdict=${r.expected.verdict}`,
      );
    }
  }

  const acc = results.length > 0 ? (passCount / results.length) * 100 : 0;
  const avgRiskErr = averageRiskError(results);

  console.log("\n--- Summary ---");
  console.log(`Accuracy: ${acc.toFixed(1)}% (${passCount}/${results.length})`);
  console.log(`Avg Risk Error: ${avgRiskErr.toFixed(2)}`);
}

export function printAbReport(
  cases: HarnessCase[],
  variantLabels: string[],
  resultsPerVariant: HarnessResult[][],
): void {
  if (variantLabels.length !== resultsPerVariant.length) {
    throw new Error("variantLabels and resultsPerVariant length mismatch");
  }

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const parts: string[] = [];
    for (let v = 0; v < variantLabels.length; v++) {
      const r = resultsPerVariant[v][i];
      const icon = r.pass ? "✅" : "❌";
      parts.push(`${variantLabels[v]}:${icon}${r.actual.verdict}`);
    }
    console.log(`${c.id} | ${parts.join(" | ")}`);
  }

  console.log("\n--- Summary by variant ---");
  for (let v = 0; v < variantLabels.length; v++) {
    const rs = resultsPerVariant[v];
    const pass = rs.filter((x) => x.pass).length;
    const acc = rs.length > 0 ? (pass / rs.length) * 100 : 0;
    console.log(
      `${variantLabels[v]}: ${acc.toFixed(1)}% (${pass}/${rs.length}), Avg Risk Error: ${averageRiskError(rs).toFixed(2)}`,
    );
  }
}
