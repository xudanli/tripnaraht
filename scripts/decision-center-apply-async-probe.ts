/**
 * Async apply probe — POST .../apply?async=1 → poll apply-tasks/:taskId
 *
 * Usage:
 *   npm run decision-center:apply-async-probe
 *   npm run decision-center:apply-async-probe -- [tripId] [baseUrl]
 */

import 'dotenv/config';

const DEFAULT_TRIP_ID = '510d95ce-7cc4-4a07-8aba-2d4694451a3c';
const args = process.argv.slice(2);
const tripId = args[0] ?? DEFAULT_TRIP_ID;
const baseUrl = (args[1] ?? 'http://localhost:3000/api').replace(/\/$/, '');

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

function enc(id: string): string {
  return encodeURIComponent(id);
}

async function apiRaw(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: ApiResponse<unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResponse<unknown>;
  return { status: res.status, json };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log(`Apply async probe — trip=${tripId} base=${baseUrl}\n`);

  const list = await apiRaw('GET', `/trips/${tripId}/decision-problems`);
  if (!list.json.success) {
    console.error(`✗ list failed: ${list.json.error?.message}`);
    process.exit(1);
  }

  const problems =
    (list.json.data as { items?: Array<{ problemId: string; title?: string; workflowStatus?: string; executionStatus?: string }> })
      ?.items ?? [];

  let picked:
    | { problemId: string; actionId: string; title?: string; requiredAcknowledgements?: string[] }
    | undefined;

  for (const problem of problems) {
    if (problem.executionStatus === 'APPLYING') {
      console.log(`  skip ${problem.problemId}: stuck APPLYING`);
      continue;
    }

    const detailRes = await apiRaw(
      'GET',
      `/trips/${tripId}/decision-problems/${enc(problem.problemId)}`,
    );
    if (!detailRes.json.success) continue;

    const detail = detailRes.json.data as {
      actions?: Array<{ actionId: string; allowed?: boolean; requiresConfirmation?: boolean }>;
      actionability?: { writeChain?: string; requiresAction?: boolean };
      problem?: { workflowStatus?: string; executionStatus?: string };
    };

    const actions = (detail.actions ?? []).filter((a) => a.allowed !== false);
    if (!actions.length) continue;

    const action = actions[0];
    const previewRes = await apiRaw(
      'POST',
      `/trips/${tripId}/decision-problems/${enc(problem.problemId)}/options/${enc(action.actionId)}/preview`,
      {},
    );
    const requiredAcknowledgements =
      previewRes.json.success &&
      Array.isArray((previewRes.json.data as { requiredAcknowledgements?: string[] })?.requiredAcknowledgements)
        ? (previewRes.json.data as { requiredAcknowledgements: string[] }).requiredAcknowledgements
        : action.requiresConfirmation
          ? ['我确认已阅读方案说明并同意应用该修复']
          : undefined;

    picked = {
      problemId: problem.problemId,
      actionId: action.actionId,
      title: problem.title,
      requiredAcknowledgements,
    };
    console.log(
      `✓ picked problemId=${picked.problemId} action=${picked.actionId} writeChain=${detail.actionability?.writeChain ?? '?'}`,
    );
    break;
  }

  if (!picked) {
    console.error('✗ no suitable problem with actions');
    process.exit(1);
  }

  const idempotencyKey = `resolution:${tripId}:${picked.problemId}:${picked.actionId}:apply-probe`;
  let acknowledgement = picked.requiredAcknowledgements;

  let submit = await apiRaw(
    'POST',
    `/trips/${tripId}/decision-problems/${enc(picked.problemId)}/resolutions`,
    {
      selectedActionId: picked.actionId,
      idempotencyKey,
      acknowledgement,
    },
  );

  if (
    !submit.json.success &&
    submit.json.error?.message === 'DECISION_ACKNOWLEDGEMENT_REQUIRED' &&
    Array.isArray(submit.json.error.details?.requiredAcknowledgements)
  ) {
    acknowledgement = submit.json.error.details.requiredAcknowledgements as string[];
    console.log(`  retry resolutions with acknowledgement (${acknowledgement.length} items)`);
    submit = await apiRaw(
      'POST',
      `/trips/${tripId}/decision-problems/${enc(picked.problemId)}/resolutions`,
      {
        selectedActionId: picked.actionId,
        idempotencyKey,
        acknowledgement,
      },
    );
  }

  if (!submit.json.success) {
    console.error(
      `✗ POST resolutions failed (${submit.status}): ${submit.json.error?.code} ${submit.json.error?.message}`,
    );
    if (submit.json.error?.details) {
      console.error('  details:', JSON.stringify(submit.json.error.details));
    }
    process.exit(1);
  }

  console.log(
    `✓ resolution submitted resolutionId=${(submit.json.data as { resolution?: { resolutionId?: string } })?.resolution?.resolutionId}`,
  );

  const t0 = Date.now();
  const accepted = await apiRaw(
    'POST',
    `/trips/${tripId}/decision-problems/${enc(picked.problemId)}/apply?async=1`,
  );

  console.log(`\n--- POST apply?async=1 (${Date.now() - t0}ms, HTTP ${accepted.status}) ---`);
  if (accepted.status !== 202) {
    console.warn(`⚠ expected HTTP 202, got ${accepted.status}`);
  }
  if (!accepted.json.success) {
    console.error(`✗ apply async failed: ${accepted.json.error?.message}`);
    process.exit(1);
  }

  const acceptData = accepted.json.data as {
    taskId?: string;
    pollUrl?: string;
    pollIntervalMs?: number;
    status?: string;
  };
  const taskId = acceptData.taskId;
  const pollUrl = acceptData.pollUrl;
  if (!taskId || !pollUrl) {
    console.error('✗ missing taskId/pollUrl in 202 response');
    console.log(JSON.stringify(accepted.json.data, null, 2));
    process.exit(1);
  }

  console.log(`✓ taskId=${taskId}`);
  console.log(`  pollUrl=${pollUrl}`);
  console.log(`  pollIntervalMs=${acceptData.pollIntervalMs ?? 2000}`);

  const pollInterval = acceptData.pollIntervalMs ?? 2000;
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    const pollPath = pollUrl.startsWith('/api') ? pollUrl.slice(4) : pollUrl;
    const pollRes = await apiRaw('GET', pollPath);

    if (!pollRes.json.success) {
      console.error(`✗ poll failed: ${pollRes.json.error?.message}`);
      process.exit(1);
    }

    const task = pollRes.json.data as {
      status?: string;
      error?: string;
      result?: { revalidation?: { status?: string }; problem?: { executionStatus?: string } };
    };

    console.log(
      `  poll status=${task.status} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );

    if (task.status === 'READY') {
      console.log('\n✓ apply async READY');
      console.log(
        `  executionStatus=${task.result?.problem?.executionStatus} revalidation=${task.result?.revalidation?.status}`,
      );
      console.log(`  total elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return;
    }
    if (task.status === 'FAILED') {
      console.error(`\n✗ apply async FAILED: ${task.error}`);
      process.exit(1);
    }
  }

  console.error('\n✗ poll timeout after 120s');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
