/**
 * Decision Center staging / local QA runner (API-level).
 * Usage: npx ts-node --transpile-only scripts/decision-center-staging-qa.ts [tripId] [baseUrl]
 */

const tripId = process.argv[2] ?? '807b3c54-4793-4006-a66d-67e79faa6fc2';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000/api').replace(/\/$/, '');

type ApiResponse<T> = { success: boolean; data?: T; error?: { code?: string; message?: string } };

interface CheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

const checks: CheckResult[] = [];

function check(id: string, pass: boolean, detail: string) {
  checks.push({ id, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}: ${detail}`);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiResponse<T>;
}

function enc(problemId: string): string {
  return encodeURIComponent(problemId);
}

function skip(id: string, detail: string) {
  checks.push({ id, pass: true, detail });
  console.log(`[SKIP] ${id}: ${detail}`);
}

async function main() {
  console.log(`Decision Center QA — trip=${tripId} base=${baseUrl}\n`);

  const list = await api<{
    items: Array<{ id: string; status: string; type: string; title: string }>;
    meta: { tripVersion: string };
  }>('GET', `/trips/${tripId}/decision-problems`);

  check('QA-00-list', list.success === true, `problems=${list.data?.items.length ?? 0}`);
  if (!list.success || !list.data?.items.length) {
    printSummary();
    process.exit(1);
  }

  const travelProblem = list.data.items.find((p) => p.title.includes('交通时间不足'));
  const roadProblem = list.data.items.find((p) => p.id.includes('long_distance'));
  const displayProbe =
    travelProblem ??
    list.data.items.find((p) => p.type === 'INFEASIBILITY' || p.affectedDayNumbers?.length);

  if (displayProbe) {
    const detail = await api<{
      status: string;
      affectedScopeDisplay?: Array<{ label: string; secondaryLabel?: string }>;
      assertions: unknown[];
    }>('GET', `/trips/${tripId}/decision-problems/${enc(displayProbe.id)}`);

    check(
      'QA-01-affectedScopeDisplay',
      Boolean(detail.data?.affectedScopeDisplay?.length && detail.data.affectedScopeDisplay[0].label),
      `labels=${detail.data?.affectedScopeDisplay?.map((d) => d.label).join(' | ') ?? 'none'}`,
    );
  } else {
    check('QA-01-affectedScopeDisplay', false, 'no suitable problem for display probe');
  }

  if (travelProblem) {
    const detail = await api<{
      status: string;
      affectedScopeDisplay?: Array<{ label: string; secondaryLabel?: string }>;
      assertions: unknown[];
    }>('GET', `/trips/${tripId}/decision-problems/${enc(travelProblem.id)}`);

    const options = await api<{
      options: Array<{
        id: string;
        tradeoffs: Array<{ dimension: string; value?: number; unit?: string }>;
        executionCapability?: string;
      }>;
    }>('GET', `/trips/${tripId}/decision-problems/${enc(travelProblem.id)}/options`);

    const withNumeric = options.data?.options.filter((o) =>
      o.tradeoffs.some((t) => typeof t.value === 'number'),
    );
    check(
      'QA-02-options-numeric-tradeoffs',
      (withNumeric?.length ?? 0) > 0,
      `${withNumeric?.length ?? 0}/${options.data?.options.length ?? 0} options have numeric tradeoffs`,
    );

    const buffer30 = options.data?.options.find((o) => o.id === 'buffer-add-30');
    const buffer60 = options.data?.options.find((o) => o.id === 'buffer-add-60');
    if (buffer30 && buffer60) {
      const t30 = buffer30.tradeoffs.find((t) => t.dimension === 'TIME' && t.value != null)?.value
        ?? buffer30.tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.value != null)?.value;
      const t60 = buffer60.tradeoffs.find((t) => t.dimension === 'TIME' && t.value != null)?.value
        ?? buffer60.tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.value != null)?.value;
      check(
        'QA-03-distinct-buffer-deltas',
        t30 === 30 && t60 === 60,
        `+30=${t30 ?? '?'} +60=${t60 ?? '?'}`,
      );
    } else {
      skip(
        'QA-03-distinct-buffer-deltas',
        'no buffer-add-30/60 preset options (inter-day or structural repair only)',
      );
    }

    const pick =
      options.data?.options.find((o) => o.executionCapability === 'DIRECT' && o.id.startsWith('buffer-add')) ??
      options.data?.options.find((o) => o.executionCapability === 'DIRECT') ??
      options.data?.options[0];
    if (pick) {
      const preview = await api<{ tradeoffs: unknown[]; proposedMutations?: { operations: unknown[] } }>(
        'POST',
        `/trips/${tripId}/decision-problems/${enc(travelProblem.id)}/options/${enc(pick.id)}/preview`,
        {},
      );
      check(
        'QA-04-preview',
        preview.success && (preview.data?.tradeoffs?.length ?? 0) > 0,
        `option=${pick.id} tradeoffs=${preview.data?.tradeoffs?.length ?? 0}`,
      );

      const idemKey = `qa-staging-${Date.now()}`;
      const first = await api<{
        executionStatus?: string;
        idempotentReplay?: boolean;
        decision: { id: string; status: string };
        tripVersionAfter?: string;
      }>('POST', `/trips/${tripId}/decisions`, {
        problemId: travelProblem.id,
        selectedOptionId: pick.id,
        idempotencyKey: idemKey,
        execute: true,
        acknowledgement: ['已确认应用该修复方案'],
      });

      check(
        'QA-05-normal-apply',
        first.success && first.data?.executionStatus !== 'IDEMPOTENT_REPLAY',
        `executionStatus=${first.data?.executionStatus ?? first.error?.message}`,
      );

      const second = await api<{
        executionStatus?: string;
        idempotentReplay?: boolean;
        effectiveDecisionId?: string;
      }>('POST', `/trips/${tripId}/decisions`, {
        problemId: travelProblem.id,
        selectedOptionId: pick.id,
        idempotencyKey: idemKey,
        execute: true,
        acknowledgement: ['已确认应用该修复方案'],
      });

      check(
        'QA-06-idempotent-replay',
        second.success &&
          (second.data?.idempotentReplay === true || second.data?.executionStatus === 'IDEMPOTENT_REPLAY'),
        `idempotentReplay=${second.data?.idempotentReplay} executionStatus=${second.data?.executionStatus}`,
      );

      const after = await api<{ status: string }>(
        'GET',
        `/trips/${tripId}/decision-problems/${enc(travelProblem.id)}`,
      );
      check(
        'QA-07-problem-resolution',
        after.data?.status === 'RESOLVED' || first.data?.executionStatus === 'APPLIED',
        `problemStatus=${after.data?.status} firstExec=${first.data?.executionStatus}`,
      );
    }
  } else {
    skip('QA-01-travel-problem', 'no 交通时间不足 problem (resolved or different fixture)');

    const applyProbeProblem = list.data.items.find(
      (p) => p.status === 'OPEN' || p.status === 'WAITING_DECISION',
    );
    if (applyProbeProblem) {
      const opts = await api<{
        options: Array<{ id: string; executionCapability?: string }>;
      }>('GET', `/trips/${tripId}/decision-problems/${enc(applyProbeProblem.id)}/options`);
      const direct = opts.data?.options.find((o) => o.executionCapability === 'DIRECT');
      if (direct) {
        const idemKey = `qa-staging-fallback-${Date.now()}`;
        const first = await api<{ executionStatus?: string }>('POST', `/trips/${tripId}/decisions`, {
          problemId: applyProbeProblem.id,
          selectedOptionId: direct.id,
          idempotencyKey: idemKey,
          execute: true,
          acknowledgement: ['已确认应用该修复方案'],
        });
        const second = await api<{ idempotentReplay?: boolean; executionStatus?: string }>(
          'POST',
          `/trips/${tripId}/decisions`,
          {
            problemId: applyProbeProblem.id,
            selectedOptionId: direct.id,
            idempotencyKey: idemKey,
            execute: true,
            acknowledgement: ['已确认应用该修复方案'],
          },
        );
        check(
          'QA-05-normal-apply-fallback',
          first.success && first.data?.executionStatus !== 'IDEMPOTENT_REPLAY',
          `problem=${applyProbeProblem.id.slice(0, 40)} exec=${first.data?.executionStatus ?? first.error?.message}`,
        );
        check(
          'QA-06-idempotent-replay-fallback',
          second.success &&
            (second.data?.idempotentReplay === true || second.data?.executionStatus === 'IDEMPOTENT_REPLAY'),
          `idempotentReplay=${second.data?.idempotentReplay} executionStatus=${second.data?.executionStatus}`,
        );
      }
    }
  }

  if (roadProblem) {
    const detail = await api<{ message?: string; description?: string }>(
      'GET',
      `/trips/${tripId}/decision-problems/${enc(roadProblem.id)}`,
    );
    const text = `${detail.data?.description ?? ''}`;
    check(
      'QA-08-road-class-threshold',
      !text.includes('>250km') || text.includes('>380km') || text.includes('>228km'),
      text.includes('>250km') ? 'still contains >250km' : 'no stale >250km in description',
    );
  }

  const overview = await api<{
    recentDecisions: Array<{ executionStatus?: string; recordStatus?: string; needsRepair?: boolean }>;
  }>('GET', `/trips/${tripId}/decision-center/overview`);

  const recent = overview.data?.recentDecisions?.[0];
  check(
    'QA-09-overview-executionStatus',
    Boolean(recent?.executionStatus),
    recent ? `executionStatus=${recent.executionStatus} needsRepair=${recent.needsRepair}` : 'no recent decisions',
  );

  printSummary();
  process.exit(checks.some((c) => !c.pass) ? 1 : 0);
}

function printSummary() {
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n--- Summary: ${passed}/${checks.length} passed ---`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
