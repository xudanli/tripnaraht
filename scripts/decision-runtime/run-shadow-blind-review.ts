/**
 * Shadow blind review CLI — list / inspect / submit review cases.
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-shadow-blind-review.ts list
 *   npx tsx scripts/decision-runtime/run-shadow-blind-review.ts show <reviewCaseId>
 *   npx tsx scripts/decision-runtime/run-shadow-blind-review.ts submit <reviewCaseId> \
 *     --preferred A --confidence 4 --trade-off "..." \
 *     --reasonableness 4 --executability 4 --requirement-fit 4 --pace-fit 4
 *
 * Env:
 *   SHADOW_REVIEW_BASE_URL (default http://localhost:3001/api)
 *   SHADOW_REVIEWER_ID (default $USER)
 */

const DEFAULT_BASE = 'http://localhost:3001/api';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type QueueItem = {
  reviewCaseId: string;
  comparisonId: string;
  tripId: string;
  status: string;
  divergenceTypes: string[];
  divergenceSeverity: string;
  blindedOptionA: ReviewPlanSnapshot;
  blindedOptionB: ReviewPlanSnapshot;
};

type ReviewPlanSnapshot = {
  dayCount: number;
  slotCount: number;
  totalDriveMinutes: number;
  utilityHint?: number;
  feasibilityLabel?: string;
  days: Array<{
    day: number;
    slots: Array<{ title: string; startTime?: string; endTime?: string; driveMinutesFromPrev?: number }>;
  }>;
};

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [shadow-review] ${line}`);
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const positional = argv.filter((a) => !a.startsWith('--'));
  const cmd = positional[0] ?? 'list';
  const reviewCaseId = positional[1];
  return {
    cmd,
    reviewCaseId,
    baseUrl: (process.env.SHADOW_REVIEW_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, ''),
    status: get('--status') ?? 'PENDING',
    limit: Number(get('--limit') ?? '20'),
    preferred: get('--preferred') as
      | 'A'
      | 'B'
      | 'EQUIVALENT'
      | 'BOTH_INVALID'
      | 'INSUFFICIENT_INFORMATION'
      | undefined,
    confidence: get('--confidence') ? Number(get('--confidence')) : undefined,
    tradeOff: get('--trade-off'),
    reasonableness: get('--reasonableness') ? Number(get('--reasonableness')) : undefined,
    executability: get('--executability') ? Number(get('--executability')) : undefined,
    requirementFit: get('--requirement-fit') ? Number(get('--requirement-fit')) : undefined,
    paceFit: get('--pace-fit') ? Number(get('--pace-fit')) : undefined,
    reviewerId: get('--reviewer') ?? process.env.SHADOW_REVIEWER_ID ?? process.env.USER ?? 'anonymous-reviewer',
    dryRun: argv.includes('--dry-run'),
  };
}

async function api<T>(
  method: string,
  baseUrl: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiResponse<T>;
}

function summarizePlan(label: string, plan: ReviewPlanSnapshot): string {
  const slots = plan.days.flatMap((d) => d.slots.map((s) => s.title)).join(' → ');
  return [
    `${label}: ${plan.dayCount}d / ${plan.slotCount} slots / drive=${plan.totalDriveMinutes}min`,
    `  utility=${plan.utilityHint ?? '?'} feasibility=${plan.feasibilityLabel ?? '?'}`,
    `  route: ${slots || '(empty)'}`,
  ].join('\n');
}

async function cmdList(opts: ReturnType<typeof parseArgs>) {
  const q = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.status) q.set('status', opts.status);
  const res = await api<{ items: QueueItem[] }>(
    'GET',
    opts.baseUrl,
    `/decision-engine/v1/shadow-reviews/queue?${q}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'queue fetch failed');
  }
  const items = res.data.items;
  log(`Pending queue (${items.length} items, status=${opts.status})`);
  for (const item of items) {
    console.log(
      `- ${item.reviewCaseId} | trip=${item.tripId} | ${item.divergenceTypes.join(',')} | ${item.divergenceSeverity}`,
    );
  }
}

async function cmdShow(opts: ReturnType<typeof parseArgs>) {
  if (!opts.reviewCaseId) throw new Error('show requires reviewCaseId');
  const res = await api<QueueItem>(
    'GET',
    opts.baseUrl,
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(opts.reviewCaseId)}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'case fetch failed');
  }
  const c = res.data;
  console.log(`Review case: ${c.reviewCaseId}`);
  console.log(`  comparison=${c.comparisonId} trip=${c.tripId} status=${c.status}`);
  console.log(`  divergence: ${c.divergenceTypes.join(', ')} (${c.divergenceSeverity})`);
  console.log(summarizePlan('Option A', c.blindedOptionA));
  console.log(summarizePlan('Option B', c.blindedOptionB));
}

async function cmdSubmit(opts: ReturnType<typeof parseArgs>) {
  if (!opts.reviewCaseId) throw new Error('submit requires reviewCaseId');
  const missing: string[] = [];
  if (!opts.preferred) missing.push('--preferred');
  if (opts.confidence == null) missing.push('--confidence');
  if (!opts.tradeOff) missing.push('--trade-off');
  if (opts.reasonableness == null) missing.push('--reasonableness');
  if (opts.executability == null) missing.push('--executability');
  if (opts.requirementFit == null) missing.push('--requirement-fit');
  if (opts.paceFit == null) missing.push('--pace-fit');
  if (missing.length) {
    throw new Error(`submit missing: ${missing.join(', ')}`);
  }

  const body = {
    preferredOption: opts.preferred,
    confidence: opts.confidence,
    tradeOffSummary: opts.tradeOff,
    scores: {
      reasonableness: opts.reasonableness,
      executability: opts.executability,
      requirementFit: opts.requirementFit,
      paceFit: opts.paceFit,
    },
    reviewerId: opts.reviewerId,
  };

  if (opts.dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const res = await api<{ submissionId?: string }>(
    'POST',
    opts.baseUrl,
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(opts.reviewCaseId)}/submit`,
    body,
    {
      'x-shadow-reviewer-id': opts.reviewerId,
      'idempotency-key': `cli-${opts.reviewCaseId}-${Date.now()}`,
    },
  );
  if (!res.success) {
    throw new Error(res.error?.message ?? 'submit failed');
  }
  log(`Submitted ${opts.reviewCaseId} → ${JSON.stringify(res.data)}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.cmd) {
    case 'list':
      await cmdList(opts);
      break;
    case 'show':
      await cmdShow(opts);
      break;
    case 'submit':
      await cmdSubmit(opts);
      break;
    default:
      throw new Error(`Unknown command: ${opts.cmd} (use list | show | submit)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
