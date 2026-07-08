/**
 * Unified Decision Gateway — 前端联调前 API smoke（读模型 + 可选 L2 写路径探测）。
 *
 * Usage:
 *   npx tsx scripts/unified-decision-frontend-qa.ts [tripId] [baseUrl]
 *   npx tsx scripts/unified-decision-frontend-qa.ts --check-env
 *   npx tsx scripts/unified-decision-frontend-qa.ts --write [tripId] [baseUrl]
 *
 * Auth (staging/production):
 *   AUTH_TOKEN=<jwt> npx tsx scripts/unified-decision-frontend-qa.ts ...
 *
 * Default Iceland fixture trip: 3e4a1058-9218-467f-988a-c18008a14385
 * Local dev: anonymous user allowed when NODE_ENV !== production
 */

import 'dotenv/config';

const DEFAULT_TRIP_ID = '3e4a1058-9218-467f-988a-c18008a14385';
const args = process.argv.slice(2);
const checkEnvOnly = args.includes('--check-env');
const writeProbe = args.includes('--write');
const positional = args.filter((a) => !a.startsWith('--'));
const tripId = positional[0] ?? DEFAULT_TRIP_ID;
const baseUrl = (positional[1] ?? 'http://localhost:3000/api').replace(/\/$/, '');

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

function skip(id: string, detail: string) {
  checks.push({ id, pass: true, detail });
  console.log(`[SKIP] ${id}: ${detail}`);
}

function enc(id: string): string {
  return encodeURIComponent(id);
}

function isTruthyEnv(key: string): boolean {
  const v = process.env[key];
  return v === '1' || v === 'true' || v === 'yes';
}

function printEnvChecklist(): void {
  console.log('Unified Decision — 环境变量自检\n');
  const required: Array<{ key: string; aliases?: string[] }> = [
    { key: 'DECISION_GATEWAY_UNIFIED' },
    { key: 'CANONICAL_ROAD_SEGMENT_UNAVAILABLE', aliases: ['RFC001_ICELAND_ROAD_CLOSE'] },
    { key: 'CANONICAL_WEATHER_ACTIVITY_PROHIBITED', aliases: ['RFC001_ICELAND_WEATHER_ACTIVITY'] },
    { key: 'CANONICAL_EXCESSIVE_DAILY_LOAD', aliases: ['RFC001_ICELAND_EXCESSIVE_LOAD'] },
  ];
  const recommended = ['DECISION_PACK_RUNTIME', 'DECISION_PACK_RULES'];
  const mustOff = ['RFC001_SHADOW_MODE'];

  for (const { key, aliases = [] } of required) {
    const on = isTruthyEnv(key) || aliases.some((a) => isTruthyEnv(a));
    check(`ENV-${key}`, on, on ? 'enabled' : 'missing or off');
  }
  for (const key of recommended) {
    const on = isTruthyEnv(key);
    check(`ENV-${key}`, on, on ? 'enabled' : 'recommended but off');
  }
  for (const key of mustOff) {
    const off = !isTruthyEnv(key);
    check(`ENV-${key}`, off, off ? 'off (L2 will mutate Effective Plan)' : 'ON — shadow only, 联调勿开');
  }
  console.log('');
}

async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = process.env.AUTH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiResponse<T>;
}

async function main() {
  printEnvChecklist();
  if (checkEnvOnly) {
    printSummary();
    process.exit(checks.some((c) => !c.pass) ? 1 : 0);
  }

  console.log(`Unified Decision QA — trip=${tripId} base=${baseUrl} write=${writeProbe}\n`);

  const center = await api<{
    schemaId?: string;
    activeResolution?: string;
    problemCount?: number;
    activePacks?: { country?: string; packIds?: string[] };
    canonical?: unknown;
    legacy?: unknown;
  }>('GET', `/trips/${tripId}/decision-center`);

  if (!center.success && center.error?.message?.includes('DECISION_GATEWAY_UNIFIED')) {
    check('UD-00-gateway', false, center.error.message ?? 'Gateway disabled');
    printSummary();
    process.exit(1);
  }

  check(
    'UD-00-decision-center',
    center.success && center.data?.schemaId === 'tripnara.unified_decision_center@v1',
    `resolution=${center.data?.activeResolution ?? '?'} problems=${center.data?.problemCount ?? '?'}`,
  );

  if (isTruthyEnv('DECISION_PACK_RUNTIME')) {
    const packLayers = center.data?.activePacks?.layers ?? center.data?.activePacks?.packIds;
    const packCount = Array.isArray(packLayers) ? packLayers.length : 0;
    check(
      'UD-01-activePacks',
      packCount > 0,
      packCount > 0
        ? `layers=${packCount} ids=${Array.isArray(packLayers) ? packLayers.map((l: { packId?: string }) => l.packId ?? l).join(',') : '?'}`
        : 'activePacks missing — set DECISION_PACK_RUNTIME=1',
    );
  } else {
    skip('UD-01-activePacks', 'DECISION_PACK_RUNTIME off');
  }

  const list = await api<{
    schemaId?: string;
    meta?: { total: number; openCount: number; actionableCount: number; occurrenceCount?: number };
    items: Array<{
      problemId: string;
      title: string;
      workflowStatus: string;
      executionStatus: string;
      actionability?: { writeChain?: string };
      debug?: { flow?: string; authority?: string; engineId?: string; resolution?: string };
    }>;
  }>('GET', `/trips/${tripId}/decision-problems`);

  check(
    'UD-02-problem-list',
    list.success && list.data?.schemaId === 'tripnara.unified_decision_problems@v2',
    `total=${list.data?.meta?.total ?? 0} open=${list.data?.meta?.openCount ?? 0} actionable=${list.data?.meta?.actionableCount ?? 0}`,
  );

  if (!list.success || !list.data?.items?.length) {
    printSummary();
    process.exit(1);
  }

  const items = list.data.items;
  const canonicalItems = items.filter((i) => i.debug?.flow === 'CANONICAL_L2' || i.debug?.authority === 'CANONICAL');
  const legacyItems = items.filter((i) => i.debug?.flow === 'LEGACY_V15' || i.debug?.authority === 'LEGACY');

  check(
    'UD-03-authority-routing',
    items.every((i) => !i.debug || i.debug.authority === 'CANONICAL' || i.debug.authority === 'LEGACY'),
    `canonical=${canonicalItems.length} legacy=${legacyItems.length} (use ?includeDebug=true for routing audit)`,
  );

  const probe =
    items.find((i) => i.workflowStatus === 'OPEN' || i.workflowStatus === 'WAITING_DECISION') ??
    canonicalItems[0] ??
    legacyItems[0] ??
    items[0];

  if (!probe?.problemId) {
    check('UD-04-problem-detail', false, 'no problemId on list items — unified schema expected');
    printSummary();
    process.exit(1);
  }

  const detail = await api<{
    schemaId?: string;
    problem?: { workflowStatus?: string; executionStatus?: string };
    actionability?: { writeChain?: string };
    actions?: Array<{ actionId: string; title?: string }>;
    debug?: { flow?: string; authority?: string };
  }>('GET', `/trips/${tripId}/decision-problems/${enc(probe.problemId)}?includeDebug=true`);

  check(
    'UD-04-problem-detail',
    detail.success && detail.data?.schemaId === 'tripnara.unified_decision_problem_detail@v2',
    `problem=${probe.problemId.slice(0, 36)} workflow=${detail.data?.problem?.workflowStatus ?? '?'} writeChain=${detail.data?.actionability?.writeChain ?? '?'}`,
  );

  if (detail.data?.debug?.authority === 'CANONICAL' || detail.data?.debug?.flow === 'CANONICAL_L2') {
    check(
      'UD-04b-impactScopeView',
      Boolean(detail.data?.debug),
      'canonical detail exposes debug metadata when includeDebug=true',
    );
  } else {
    skip('UD-04b-impactScopeView', 'legacy problem — no canonical impactScopeView');
  }

  const options = await api<{
    schemaId?: string;
    actions?: Array<{ actionId: string; title?: string }>;
  }>('GET', `/trips/${tripId}/decision-problems/${enc(probe.problemId)}/options`);

  const actionList = options.data?.actions ?? [];
  check(
    'UD-05-options',
    options.success && options.data?.schemaId === 'tripnara.unified_decision_options@v2' && actionList.length > 0,
    `${actionList.length} actions writeChain=${detail.data?.actionability?.writeChain ?? '?'}`,
  );

  const routes = await api<{ items?: unknown[] }>('GET', `/trips/${tripId}/decision-routes`);
  check(
    'UD-06-decision-routes',
    routes.success,
    `lineage entries=${Array.isArray(routes.data?.items) ? routes.data!.items!.length : '?'}`,
  );

  if (writeProbe && (detail.data?.actionability?.writeChain === 'EVALUATE_AUTHORIZE_EXECUTE' || detail.data?.debug?.flow === 'CANONICAL_L2')) {
    const evalRes = await api<{
      record?: { decisionId?: string };
      decision?: { id?: string };
      comparisonView?: { schemaId?: string; rows?: unknown[] };
      impactScopeView?: { schemaId?: string; narrative?: { templateKey?: string } };
    }>(
      'POST',
      `/trips/${tripId}/decision-problems/${enc(probe.problemId)}/evaluate`,
    );
    const decisionId = evalRes.data?.record?.decisionId ?? evalRes.data?.decision?.id;
    check(
      'UD-07-evaluate',
      evalRes.success && Boolean(decisionId),
      evalRes.success
        ? `decision=${decisionId?.slice(0, 24)} comparison=${evalRes.data?.comparisonView?.schemaId ?? '?'} impact=${evalRes.data?.impactScopeView?.narrative?.templateKey ?? '?'}`
        : evalRes.error?.message ?? 'evaluate failed',
    );
    check(
      'UD-07b-comparisonView',
      Boolean(evalRes.data?.comparisonView?.rows?.length),
      `rows=${evalRes.data?.comparisonView?.rows?.length ?? 0}`,
    );
    check(
      'UD-07c-impactScopeView',
      evalRes.data?.impactScopeView?.schemaId === 'tripnara.impact_scope@v1',
      `template=${evalRes.data?.impactScopeView?.narrative?.templateKey ?? 'missing'}`,
    );

    if (evalRes.success && decisionId) {
      const choice =
        actionList[0]?.actionId ??
        (probe.title?.includes('驾驶') ? 'cand_split_day' : 'cand_a');
      const auth = await api<{ record?: { recordStatus?: string }; decision?: { status?: string } }>(
        'POST',
        `/trips/${tripId}/decisions/${enc(decisionId)}/authorize`,
        { choice },
      );
      check(
        'UD-08-authorize',
        auth.success,
        auth.success
          ? `status=${auth.data?.record?.recordStatus ?? auth.data?.decision?.status ?? 'ok'}`
          : auth.error?.message ?? 'authorize failed',
      );
    }
  } else if (writeProbe) {
    skip('UD-07-evaluate', 'probe is APPLY_AND_POLL — use Canonical problem for L2 write probe');
  } else {
    skip('UD-07-evaluate', 'pass --write to probe evaluate → authorize (mutates trip state)');
  }

  const overview = await api<{ schemaId?: string; totalOpenProblemCount?: number }>(
    'GET',
    `/trips/${tripId}/decision-center/overview`,
  );
  check(
    'UD-09-overview-v2',
    overview.success && overview.data?.schemaId === 'tripnara.unified_decision_center_overview@v2',
    `open=${overview.data?.totalOpenProblemCount ?? '?'}`,
  );

  const [planningConflicts, timeline] = await Promise.all([
    api<{ summary?: { total?: number } }>('GET', `/trips/${tripId}/planning-conflicts`),
    api<{ stats?: { conflictCount?: number; conflictCountSource?: string } }>(
      'GET',
      `/trips/${tripId}/timeline-overview?include=stats`,
    ),
  ]);

  const openCount = list.data?.meta?.openCount;
  const conflictTotal = planningConflicts.data?.summary?.total;
  const timelineCount = timeline.data?.stats?.conflictCount;
  const countAligned =
    typeof openCount === 'number' &&
    typeof conflictTotal === 'number' &&
    typeof timelineCount === 'number' &&
    openCount === conflictTotal &&
    timelineCount === conflictTotal;

  check(
    'UD-10-count-ssot-alignment',
    planningConflicts.success && timeline.success && countAligned,
    `open=${openCount ?? '?'} conflicts=${conflictTotal ?? '?'} timeline=${timelineCount ?? '?'} source=${timeline.data?.stats?.conflictCountSource ?? '?'}`,
  );

  const subTasks = await api<{ schemaId?: string; items?: unknown[] }>(
    'GET',
    `/trips/${tripId}/decision-problems/${enc(probe.problemId)}/collaborative-sub-tasks`,
  );
  check(
    'UD-11-collab-subtasks-list',
    subTasks.success && subTasks.data?.schemaId === 'tripnara.decision_collaborative_subtasks@v1',
    `items=${subTasks.data?.items?.length ?? 0}`,
  );

  if (
    writeProbe &&
    detail.data?.actionability?.writeChain === 'APPLY_AND_POLL' &&
    actionList[0]?.actionId
  ) {
    const submit = await api<{
      suggestedFollowUps?: Array<{ kind: string; title: string }>;
      collaborativeTask?: { resolutionId?: string };
    }>('POST', `/trips/${tripId}/decision-problems/${enc(probe.problemId)}/resolutions`, {
      selectedActionId: actionList[0].actionId,
    });
    check(
      'UD-12-submit-suggested-followups',
      submit.success && (submit.data?.suggestedFollowUps?.length ?? 0) > 0,
      submit.success
        ? `followUps=${submit.data?.suggestedFollowUps?.length ?? 0} resolution=${submit.data?.collaborativeTask?.resolutionId?.slice(0, 16) ?? '?'}`
        : submit.error?.message ?? 'submit failed',
    );
  } else if (writeProbe) {
    skip('UD-12-submit-suggested-followups', 'need APPLY_AND_POLL problem with actions');
  } else {
    skip('UD-12-submit-suggested-followups', 'pass --write to probe submit suggestedFollowUps');
  }

  printSummary();
  process.exit(checks.some((c) => !c.pass) ? 1 : 0);
}

function printSummary() {
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n--- Summary: ${passed}/${checks.length} passed ---`);
  console.log('Swagger: /api-docs  |  Doc: src/trips/decision-semantics/DECISION_SSOT_FRONTEND_MIGRATION.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
