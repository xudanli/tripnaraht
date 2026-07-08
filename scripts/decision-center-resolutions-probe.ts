/**
 * Decision Problem resolutions write-path probe (POST .../resolutions).
 *
 * Usage:
 *   npm run decision-center:resolutions-probe
 *   npm run decision-center:resolutions-probe -- [tripId] [baseUrl]
 *
 * Default Iceland F208 fixture: 3e4a1058-9218-467f-988a-c18008a14385
 */

import 'dotenv/config';

const DEFAULT_TRIP_ID = '3e4a1058-9218-467f-988a-c18008a14385';
const args = process.argv.slice(2);
const tripId = args[0] ?? DEFAULT_TRIP_ID;
const baseUrl = (args[1] ?? 'http://localhost:3000/api').replace(/\/$/, '');

type ApiResponse<T> = { success: boolean; data?: T; error?: { code?: string; message?: string } };

function enc(id: string): string {
  return encodeURIComponent(id);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<ApiResponse<T>>;
}

async function main(): Promise<void> {
  console.log(`Resolutions probe — trip=${tripId} base=${baseUrl}\n`);

  const list = await api<{
    items?: Array<{ problemId: string; title?: string; semanticKey?: string }>;
    problems?: Array<{ problemId: string; title?: string; semanticKey?: string }>;
  }>('GET', `/trips/${tripId}/decision-problems`);

  if (!list.success) {
    console.error(`✗ list decision-problems failed: ${list.error?.message ?? 'unknown'}`);
    process.exit(1);
  }

  const problems = list.data?.items ?? list.data?.problems ?? [];
  let picked: { problemId: string; actionId: string; title?: string } | undefined;

  for (const problem of problems) {
    const detail = await api<{
      actions?: Array<{ actionId: string; allowed?: boolean }>;
      actionability?: { writeChain?: string };
    }>('GET', `/trips/${tripId}/decision-problems/${enc(problem.problemId)}`);

    if (!detail.success) {
      console.log(`  skip ${problem.problemId}: detail failed (${detail.error?.message})`);
      continue;
    }

    const actions = (detail.data?.actions ?? []).filter((a) => a.allowed !== false);
    if (actions.length === 0) {
      console.log(`  skip ${problem.problemId}: actions=0 (${problem.semanticKey ?? problem.title ?? '?'})`);
      continue;
    }

    picked = {
      problemId: problem.problemId,
      actionId: actions[0].actionId,
      title: problem.title,
    };
    console.log(
      `✓ picked problemId=${picked.problemId} actionId=${picked.actionId} writeChain=${detail.data?.actionability?.writeChain ?? '?'}`,
    );
    break;
  }

  if (!picked) {
    console.error('✗ no problem with allowed actions — cannot probe resolutions');
    process.exit(1);
  }

  const idempotencyKey = `resolution:${tripId}:${picked.problemId}:${picked.actionId}:probe`;
  const submit = await api<{
    resolution?: { resolutionId?: string };
    nextStep?: string;
  }>('POST', `/trips/${tripId}/decision-problems/${enc(picked.problemId)}/resolutions`, {
    selectedActionId: picked.actionId,
    idempotencyKey,
  });

  if (!submit.success) {
    console.error(`✗ POST resolutions failed: ${submit.error?.code} ${submit.error?.message}`);
    process.exit(1);
  }

  const resolutionId = submit.data?.resolution?.resolutionId ?? '?';
  const nextStep = submit.data?.nextStep ?? '?';
  console.log(`✓ resolutionId='${resolutionId}' nextStep='${nextStep}'`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
