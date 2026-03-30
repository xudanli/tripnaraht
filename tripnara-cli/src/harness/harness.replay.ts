import { loadCases } from "./harness.loader";
import { HarnessRunner } from "./harness.runner";
import { printReport } from "./harness.reporter";
import type { HarnessRunOptions } from "./harness.types";

export async function replayCase(
  caseId: string,
  filePath: string,
  opts: HarnessRunOptions,
): Promise<void> {
  const cases = loadCases(filePath);
  const target = cases.find((c) => c.id === caseId);

  if (!target) {
    throw new Error(`Case not found: ${caseId} in ${filePath}`);
  }

  console.log(`Replaying case ${caseId} (${opts.mode} mode)`);
  console.log(JSON.stringify(target, null, 2));

  const runner = new HarnessRunner();
  const result = await runner.runSingle(target, opts);

  printReport([result], { verbose: true, cases: [target] });
}

export async function replayFromArgs(options: {
  caseId: string;
  file: string;
  mode: HarnessRunOptions["mode"];
  apiBase?: string;
  apiUserId?: string;
  apiTripId?: string;
  apiToken?: string;
  maxSeconds?: number;
}): Promise<void> {
  const opts: HarnessRunOptions = {
    mode: options.mode,
    apiBase: options.apiBase,
    apiUserId: options.apiUserId,
    apiTripId: options.apiTripId,
    apiToken: options.apiToken,
    maxSeconds: options.maxSeconds,
  };
  await replayCase(options.caseId, options.file, opts);
}
