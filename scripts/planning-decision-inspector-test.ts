#!/usr/bin/env npx ts-node
/**
 * 决策检查器（四 Tab 统一读模型）接口联调测试
 *
 * GET /api/trips/:tripId/arrange-itinerary/decision-inspector?proposalId=&optionId=&conflictId=
 *
 * Usage:
 *   npx ts-node scripts/planning-decision-inspector-test.ts [tripId] [baseUrl]
 */
const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const api = `${baseUrl}/api/trips/${tripId}`;
const arrange = `${api}/arrange-itinerary`;

type Inspector = {
  schema?: string;
  mode?: string;
  tabEmptyState?: {
    causalChain?: boolean;
    planDiff?: boolean;
    memberConsensus?: boolean;
    feasibility?: boolean;
  };
  tripId?: string;
  proposalId?: string;
  optionId?: string;
  refreshUrl?: string;
  decisionBasis?: {
    schema?: string;
    whatHappened?: { headline?: string; narrative?: string };
    contextFields?: unknown[];
    optionCount?: number;
  };
  causalChain?: {
    schema?: string;
    basisSource?: string;
    nodes?: unknown[];
  };
  planDiff?: {
    optionBadge?: string;
    optionTitle?: string;
    changeRows?: unknown[];
    impactTags?: unknown[];
    unchangedItems?: string[];
    timelineCompare?: { milestones?: unknown[]; bannerText?: string };
  };
  memberConsensus?: {
    summaryBar?: string;
    supportCount?: number;
    objectionCount?: number;
    pendingCount?: number;
    totalMembers?: number;
    opinions?: unknown[];
    aiSummary?: string[];
    assessment?: { supportPercent?: number; canCreatorConfirm?: boolean; statusMessage?: string };
  };
  feasibility?: {
    canSafelyWrite?: boolean;
    headline?: string;
    gateChecks?: Array<{ id: string; label: string; status: string }>;
    executionSummary?: unknown[];
    verdict?: { status: string; message: string };
    validityWarning?: { message?: string };
  };
};

function unwrap<T>(json: Record<string, unknown>): T | undefined {
  if (json.success === true && json.data) return json.data as T;
  return json as T;
}

function isOk(status: number) {
  return status === 200 || status === 201;
}

async function getJson(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${arrange}${path}`, { signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(path: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${arrange}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function validateInspector(insp: Inspector, label: string): string[] {
  const errors: string[] = [];
  if (insp.schema !== 'tripnara.planning_decision_inspector@v1') {
    errors.push(`${label}: schema mismatch (${insp.schema})`);
  }
  if (!insp.refreshUrl?.includes('decision-inspector')) {
    errors.push(`${label}: missing refreshUrl`);
  }

  const basis = insp.decisionBasis;
  if (!basis?.whatHappened?.narrative) errors.push(`${label}: decisionBasis.whatHappened missing`);
  if (!Array.isArray(basis?.contextFields)) errors.push(`${label}: decisionBasis.contextFields missing`);

  const chain = insp.causalChain;
  if (chain?.schema !== 'tripnara.planning_causal_chain@v1') {
    errors.push(`${label}: causalChain.schema mismatch`);
  }
  if (!Array.isArray(chain?.nodes)) errors.push(`${label}: causalChain.nodes missing`);

  const diff = insp.planDiff;
  if (!diff?.optionTitle) errors.push(`${label}: planDiff.optionTitle missing`);
  if (!Array.isArray(diff?.changeRows)) errors.push(`${label}: planDiff.changeRows missing`);
  if (!Array.isArray(diff?.impactTags)) errors.push(`${label}: planDiff.impactTags missing`);
  if (!diff?.timelineCompare?.milestones) errors.push(`${label}: planDiff.timelineCompare missing`);

  const consensus = insp.memberConsensus;
  if (!consensus?.summaryBar) errors.push(`${label}: memberConsensus.summaryBar missing`);
  if (typeof consensus?.totalMembers !== 'number') errors.push(`${label}: memberConsensus.totalMembers missing`);
  if (!Array.isArray(consensus?.opinions)) errors.push(`${label}: memberConsensus.opinions missing`);
  if (!consensus?.assessment?.statusMessage) errors.push(`${label}: memberConsensus.assessment missing`);

  const feas = insp.feasibility;
  if (typeof feas?.canSafelyWrite !== 'boolean') errors.push(`${label}: feasibility.canSafelyWrite missing`);
  if (!feas?.headline) errors.push(`${label}: feasibility.headline missing`);
  if (!Array.isArray(feas?.gateChecks) || feas.gateChecks.length === 0) {
    errors.push(`${label}: feasibility.gateChecks empty`);
  }
  if (!feas?.verdict?.status) errors.push(`${label}: feasibility.verdict missing`);
  if (!Array.isArray(feas?.executionSummary)) errors.push(`${label}: feasibility.executionSummary missing`);

  return errors;
}

function printInspector(insp: Inspector) {
  console.log(`  schema: ${insp.schema}`);
  console.log(`  proposalId: ${insp.proposalId?.slice(0, 28)}…`);
  console.log(`  optionId: ${insp.optionId?.slice(0, 28) ?? '—'}…`);

  console.log('\n  [decisionBasis]');
  console.log(`    narrative: ${insp.decisionBasis?.whatHappened?.narrative?.slice(0, 60) ?? '—'}…`);
  console.log(`    contextFields: ${insp.decisionBasis?.contextFields?.length ?? 0}`);
  console.log(`    optionCount: ${insp.decisionBasis?.optionCount ?? '—'}`);

  console.log('\n  [Tab 1 · 因果链]');
  console.log(`    basisSource: ${insp.causalChain?.basisSource ?? '—'}`);
  console.log(`    nodes: ${insp.causalChain?.nodes?.length ?? 0}`);
  for (const n of (insp.causalChain?.nodes ?? []).slice(0, 3) as Array<{ description?: string }>) {
    console.log(`      • ${n.description?.slice(0, 50) ?? '—'}`);
  }

  console.log('\n  [Tab 2 · 计划差异]');
  console.log(`    ${insp.planDiff?.optionBadge ?? ''} ${insp.planDiff?.optionTitle ?? '—'}`);
  console.log(`    changeRows: ${insp.planDiff?.changeRows?.length ?? 0}`);
  for (const tag of (insp.planDiff?.impactTags ?? []).slice(0, 3) as Array<{ label?: string }>) {
    console.log(`      tag: ${tag.label}`);
  }
  if (insp.planDiff?.timelineCompare?.bannerText) {
    console.log(`    banner: ${insp.planDiff.timelineCompare.bannerText}`);
  }

  console.log('\n  [Tab 3 · 成员共识]');
  console.log(`    ${insp.memberConsensus?.summaryBar ?? '—'}`);
  console.log(
    `    支持/异议/未回复: ${insp.memberConsensus?.supportCount}/${insp.memberConsensus?.objectionCount}/${insp.memberConsensus?.pendingCount} (共 ${insp.memberConsensus?.totalMembers})`,
  );
  console.log(`    assessment: ${insp.memberConsensus?.assessment?.statusMessage ?? '—'}`);

  console.log('\n  [Tab 4 · 可执行性]');
  console.log(`    ${insp.feasibility?.headline ?? '—'}`);
  console.log(`    canSafelyWrite: ${insp.feasibility?.canSafelyWrite}`);
  for (const g of insp.feasibility?.gateChecks ?? []) {
    console.log(`      ${g.status === 'pass' ? '✓' : g.status === 'warn' ? '!' : '✗'} ${g.label}`);
  }
  console.log(`    verdict: ${insp.feasibility?.verdict?.status} — ${insp.feasibility?.verdict?.message}`);
}

async function main() {
  console.log(`Trip: ${tripId}`);
  const errors: string[] = [];

  // ── 0. 缺 proposalId / problemId 应 400 ───────────────────
  console.log('\n── 0. 缺 proposalId & problemId → 400 ──');
  const bad = await getJson('/decision-inspector');
  if (bad.status === 400 || bad.json.success === false) {
    console.log(`  ✅ 返回 ${bad.status}`);
  } else {
    errors.push(`missing ids: expected 400, got ${bad.status}`);
  }

  // ── 0b. 决策空间 problemId 模式 ─────────────────────────
  console.log('\n── 0b. GET decision-inspector (problemId / 决策空间) ──');
  const probList = await fetch(`${baseUrl}/api/trips/${tripId}/decision-problems`).then((r) =>
    r.json(),
  );
  const problemId = probList.data?.items?.[0]?.problemId as string | undefined;
  if (problemId) {
    const probRes = await getJson(
      `/decision-inspector?problemId=${encodeURIComponent(problemId)}`,
    );
    const probInsp = unwrap<Inspector>(probRes.json);
    if (probRes.status === 200 && probInsp?.mode === 'problem') {
      console.log(`  ✅ mode=problem tabEmpty=${JSON.stringify(probInsp.tabEmptyState)}`);
      if (probInsp.planDiff?.changeRows?.length !== 0) {
        errors.push('problem mode: planDiff should be empty');
      }
      if (probInsp.feasibility?.canSafelyWrite !== false) {
        errors.push('problem mode: canSafelyWrite should be false');
      }
      if (probInsp.memberConsensus?.aiSummary?.length) {
        errors.push('problem mode: aiSummary should be empty');
      }
    } else {
      errors.push(`problem mode: HTTP ${probRes.status}`);
    }
  } else {
    console.log('  skip: no decision-problems on trip');
  }

  // ── 1. 创建草案（analyze-move 带重叠，内容更丰富）────────
  console.log('\n── 1. 创建草案 (analyze-move) ──');
  const timeline = await fetch(`${api}/schedule-timeline?include=items`);
  const tlData = unwrap<{ days?: Array<{ itineraryItems?: Array<{ id: string; name?: string }> }> }>(
    (await timeline.json()) as Record<string, unknown>,
  );
  const item = tlData?.days?.[0]?.itineraryItems?.[0];
  if (!item?.id) {
    console.error('无行程项，无法创建草案');
    process.exit(1);
  }
  console.log(`  item: ${item.name ?? item.id.slice(0, 8)}…`);

  const move = await postJson(`/items/${item.id}/analyze-move`, {
    dayIndex: 1,
    startTime: '16:00',
    endTime: '17:30',
    commitMode: 'proposal',
  });
  const moveData = unwrap<{
    proposal?: {
      proposalId?: string;
      decisionPack?: { options?: Array<{ id: string; recommended?: boolean }> };
    };
  }>(move.json);

  if (!isOk(move.status) || !moveData?.proposal?.proposalId) {
    console.error('创建草案失败:', JSON.stringify(move.json));
    process.exit(1);
  }

  const proposalId = moveData.proposal.proposalId;
  const primaryOption =
    moveData.proposal.decisionPack?.options?.find((o) => o.recommended) ??
    moveData.proposal.decisionPack?.options?.[0];
  console.log(`  proposalId: ${proposalId}`);
  console.log(`  primaryOption: ${primaryOption?.id ?? '—'}`);

  try {
    // ── 2. 默认 option（recommended）────────────────────────
    console.log('\n── 2. GET decision-inspector (default option) ──');
    const res = await getJson(`/decision-inspector?proposalId=${encodeURIComponent(proposalId)}`);
    const insp = unwrap<Inspector>(res.json);

    if (res.status !== 200 || !insp) {
      errors.push(`inspector default: HTTP ${res.status}`);
      console.log(`  ❌ HTTP ${res.status}`);
    } else {
      printInspector(insp);
      errors.push(...validateInspector(insp, 'default'));
    }

    // ── 3. 指定 optionId ───────────────────────────────────
    if (primaryOption?.id) {
      console.log('\n── 3. GET decision-inspector (optionId) ──');
      const res2 = await getJson(
        `/decision-inspector?proposalId=${encodeURIComponent(proposalId)}&optionId=${encodeURIComponent(primaryOption.id)}`,
      );
      const insp2 = unwrap<Inspector>(res2.json);
      if (res2.status !== 200 || !insp2) {
        errors.push(`inspector optionId: HTTP ${res2.status}`);
      } else if (insp2.optionId !== primaryOption.id) {
        errors.push(`inspector optionId: got ${insp2.optionId}, expected ${primaryOption.id}`);
      } else {
        console.log(`  ✅ optionId=${insp2.optionId?.slice(0, 32)}…`);
        console.log(`  planDiff.title: ${insp2.planDiff?.optionTitle}`);
        errors.push(...validateInspector(insp2, 'optionId'));
      }
    }

    // ── 4. 无效 proposalId → 404 ───────────────────────────
    console.log('\n── 4. 无效 proposalId → 404 ──');
    const notFound = await getJson('/decision-inspector?proposalId=proposal_nonexistent');
    if (notFound.status === 404 || notFound.json.success === false) {
      console.log(`  ✅ 返回 ${notFound.status}`);
    } else {
      errors.push(`invalid proposalId: expected 404, got ${notFound.status}`);
    }
  } finally {
    await postJson(`/proposals/${proposalId}/discard`, {});
    console.log('\n  (草案已 discard)');
  }

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  if (errors.length === 0) {
    console.log('✅ 决策检查器四 Tab 测试全部通过');
    return;
  }
  console.log(`❌ ${errors.length} 项问题:`);
  for (const e of errors) console.log(`  • ${e}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
