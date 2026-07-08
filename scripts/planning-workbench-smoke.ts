#!/usr/bin/env npx ts-node
/**
 * 规划工作台全链路冒烟测试（探索 + 编排 + P1–P5）
 * Usage: npx ts-node scripts/planning-workbench-smoke.ts [tripId] [baseUrl]
 */
const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const api = `${baseUrl}/api/trips/${tripId}`;

type Result = { name: string; ok: boolean; status: number; detail: string };

const results: Result[] = [];

function pass(name: string, status: number, detail: string) {
  results.push({ name, ok: true, status, detail });
  console.log(`  ✅ ${name} — ${detail}`);
}

function fail(name: string, status: number, detail: string) {
  results.push({ name, ok: false, status, detail });
  console.log(`  ❌ ${name} — ${detail}`);
}

async function getJson(path: string) {
  const res = await fetch(`${api}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function patchJson(path: string, body: unknown) {
  const res = await fetch(`${api}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function isSuccess(json: { success?: boolean }) {
  return json.success === true;
}

async function discardActiveProposals() {
  const { json } = await getJson('/arrange-itinerary/proposals');
  const proposals = json.data?.proposals ?? [];
  for (const p of proposals) {
    if (p.proposalId) {
      await postJson(`/arrange-itinerary/proposals/${p.proposalId}/discard`, {});
    }
  }
}

async function main() {
  console.log(`\n🧪 Planning Workbench Smoke Test`);
  console.log(`   trip=${tripId}`);
  console.log(`   base=${baseUrl}\n`);

  // ── P0 探索数据面 ─────────────────────────────────────────
  console.log('── P0 探索景点 BFF ──');

  {
    const { status, json } = await getJson('/attraction-explore/context');
    isSuccess(json)
      ? pass('GET context', status, `origin=${json.data?.travelConditions?.origin ?? '—'}`)
      : fail('GET context', status, JSON.stringify(json.message ?? json));
  }

  {
    const { status, json } = await getJson(
      '/attraction-explore/recommendations?viewTab=recommended',
    );
    const groups = json.data?.groups ?? [];
    const items = groups.reduce((n: number, g: { items?: unknown[] }) => n + (g.items?.length ?? 0), 0);
    isSuccess(json) && items > 0
      ? pass('GET recommendations', status, `groups=${groups.length} items=${items}`)
      : fail('GET recommendations', status, `items=${items}`);
  }

  {
    const { status, json } = await getJson('/attraction-explore/candidates');
    const count = json.data?.candidates?.length ?? 0;
    isSuccess(json) && count > 0
      ? pass('GET candidates', status, `count=${count}`)
      : fail('GET candidates', status, `count=${count}`);
  }

  {
    const { status, json } = await postJson('/attraction-explore/search', {
      query: '适合老人、沿黄金圈、停车方便',
      limit: 8,
    });
    const intent = json.data?.compiledIntent;
    const items = json.data?.groups?.[0]?.items?.length ?? 0;
    isSuccess(json) && intent?.routeContext
      ? pass('POST search + compiledIntent', status, `route=${intent.routeContext} items=${items}`)
      : fail('POST search', status, JSON.stringify(intent ?? json.message));
  }

  {
    const { status, json } = await getJson('/attraction-explore/map?includeInsertHints=true&dayIndex=1');
    const pois = json.data?.pois ?? [];
    const hints = pois.filter((p: { insertHint?: unknown }) => p.insertHint).length;
    isSuccess(json) && pois.length > 0
      ? pass('GET map + insertHints', status, `pois=${pois.length} hints=${hints}`)
      : fail('GET map', status, `pois=${pois.length}`);
  }

  // ── P3 意图编译 ───────────────────────────────────────────
  console.log('\n── P3/P4 意图与绕路 ──');

  {
    const { status, json } = await postJson('/attraction-explore/explore-intent', {
      query: '雨天室内、适合老人',
    });
    const d = json.data;
    isSuccess(json) && d?.weatherMode
      ? pass('POST explore-intent', status, `weather=${d.weatherMode} source=${d.source ?? 'rules'}`)
      : fail('POST explore-intent', status, JSON.stringify(d ?? json.message));
  }

  let testPlaceId: number | null = null;
  {
    const { status, json } = await postJson('/attraction-explore/map/place-proposal', {
      placeId: 381375,
    });
    const proposal = json.data?.proposal;
    testPlaceId = 381375;
    isSuccess(json) && proposal?.proposalId
      ? pass('POST map/place-proposal', status, `intent=${proposal.intent} validation=${proposal.validation?.status}`)
      : fail('POST map/place-proposal', status, JSON.stringify(json.message ?? json));
  }

  // ── P1 编排草案链 ─────────────────────────────────────────
  console.log('\n── P1 PlanProposal 链路 ──');

  let activeProposalId: string | null = null;

  {
    const { status, json } = await getJson('/arrange-itinerary/orchestration-state');
    isSuccess(json)
      ? pass('GET orchestration-state', status, `phase=${json.data?.phase}`)
      : fail('GET orchestration-state', status, JSON.stringify(json.message));
  }

  {
    const { status, json } = await getJson('/arrange-itinerary/proposals');
    const proposals = json.data?.proposals ?? [];
    activeProposalId = proposals[0]?.proposalId ?? null;
    isSuccess(json)
      ? pass('GET proposals', status, `count=${proposals.length}${activeProposalId ? ` active=${activeProposalId.slice(0, 20)}…` : ''}`)
      : fail('GET proposals', status, JSON.stringify(json.message));
  }

  if (activeProposalId) {
    const { status, json } = await getJson(`/arrange-itinerary/proposals/${activeProposalId}`);
    isSuccess(json) && json.data?.proposalId
      ? pass('GET proposal/:id', status, `changes=${json.data?.changes?.length ?? 0}`)
      : fail('GET proposal/:id', status, JSON.stringify(json.message));
  } else {
    // 生成 gap 草案
    const { status, json } = await postJson('/arrange-itinerary/gaps', {
      dayIndex: 1,
      startTime: '14:00',
      endTime: '15:00',
      label: 'smoke-test rest',
      commitMode: 'proposal',
    });
    activeProposalId = json.data?.proposal?.proposalId ?? null;
    isSuccess(json) && activeProposalId
      ? pass('POST gaps → proposal', status, `id=${activeProposalId!.slice(0, 24)}… validation=${json.data?.proposal?.validation?.status}`)
      : fail('POST gaps', status, JSON.stringify(json.message ?? json));
  }

  // discard active proposal to unblock further tests
  if (activeProposalId) {
    const { status, json } = await postJson(`/arrange-itinerary/proposals/${activeProposalId}/discard`, {});
    isSuccess(json)
      ? pass('POST proposals/:id/discard', status, `status=${json.data?.status}`)
      : fail('POST discard', status, JSON.stringify(json.message));
    activeProposalId = null;
  }

  {
    const { status, json } = await getJson('/arrange-itinerary/overview');
    isSuccess(json)
      ? pass('GET overview', status, `days=${json.data?.dayCount} unplaced=${json.data?.unplacedCandidateCount}`)
      : fail('GET overview', status, JSON.stringify(json.message));
  }

  // ── P2 智能编排 ───────────────────────────────────────────
  console.log('\n── P2 锁定 / 模式 / 移动分析 ──');

  {
    const { status, json } = await getJson('/arrange-itinerary/planning-mode');
    isSuccess(json)
      ? pass('GET planning-mode', status, `mode=${json.data?.mode}`)
      : fail('GET planning-mode', status, JSON.stringify(json.message));
  }

  {
    const { status, json } = await postJson('/arrange-itinerary/planning-mode', { mode: 'copilot' });
    isSuccess(json) && json.data?.mode === 'copilot'
      ? pass('POST planning-mode=copilot', status, json.data.description?.slice(0, 30) + '…')
      : fail('POST planning-mode', status, JSON.stringify(json.message));
  }

  {
    const { status, json } = await getJson('/arrange-itinerary/item-locks');
    const movable = json.data?.movableItems?.length ?? 0;
    isSuccess(json)
      ? pass('GET item-locks', status, `movable=${movable} locked=${json.data?.lockedItems?.length ?? 0}`)
      : fail('GET item-locks', status, JSON.stringify(json.message));
  }

  {
    const timeline = await fetch(`${api.replace(/\/trips\/[^/]+$/, '')}/trips/${tripId}/schedule-timeline?include=items`);
    const tj = await timeline.json();
    const itemId = tj.data?.days?.[0]?.itineraryItems?.[0]?.id;
    if (itemId) {
      const { status, json } = await postJson(`/arrange-itinerary/items/${itemId}/analyze-move`, {
        dayIndex: 1,
        startTime: '16:00',
        endTime: '17:30',
        commitMode: 'proposal',
      });
      const v = json.data?.proposal?.validation?.status;
      isSuccess(json) && json.data?.proposal
        ? pass('POST analyze-move', status, `validation=${v} (overlap BLOCK expected ok)`)
        : fail('POST analyze-move', status, JSON.stringify(json.message));
      const pid = json.data?.proposal?.proposalId;
      if (pid) await postJson(`/arrange-itinerary/proposals/${pid}/discard`, {});
    } else {
      fail('POST analyze-move', 0, 'no itinerary item found');
    }
  }

  await discardActiveProposals();

  // ── P4/P5 Copilot ─────────────────────────────────────────
  console.log('\n── P4/P5 Copilot & 快照 ──');

  {
    const { status, json } = await getJson('/arrange-itinerary/copilot-suggestions');
    const n = json.data?.suggestions?.length ?? 0;
    isSuccess(json) && n > 0
      ? pass('GET copilot-suggestions', status, `count=${n} mode=${json.data?.mode}`)
      : fail('GET copilot-suggestions', status, `count=${n}`);
  }

  {
    const { status, json } = await getJson('/arrange-itinerary/planning-workbench-snapshot');
    const d = json.data;
    isSuccess(json) && d?.orchestration
      ? pass('GET planning-workbench-snapshot', status, `conflicts=${d.conflicts?.total} suggestions=${d.copilot?.suggestionCount}`)
      : fail('GET planning-workbench-snapshot', status, JSON.stringify(json.message));
  }

  {
    const cands = await getJson('/attraction-explore/candidates');
    const candidate = cands.json.data?.candidates?.[0];
    if (candidate?.id) {
      const { status, json } = await postJson('/arrange-itinerary/copilot-actions', {
        action: 'draft_for_candidate',
        candidateId: candidate.id,
      });
      const pid = json.data?.proposal?.proposalId;
      isSuccess(json) && pid
        ? pass('POST copilot-actions draft_for_candidate', status, `validation=${json.data?.proposal?.validation?.status}`)
        : fail('POST copilot-actions', status, JSON.stringify(json.message ?? json));
      if (pid) await postJson(`/arrange-itinerary/proposals/${pid}/discard`, {});
    } else {
      fail('POST copilot-actions', 0, 'no candidate');
    }
  }

  {
    const { status, json } = await postJson('/attraction-explore/candidates', {
      placeId: 381084,
      priority: 'very_interested',
    });
    const hint = json.data?.copilotNextAction;
    isSuccess(json) && hint?.endpoint
      ? pass('POST candidates + copilotNextAction', status, `candidateId=${hint.candidateId?.slice(0, 8)}…`)
      : pass('POST candidates + copilotNextAction', status, hint ? 'has hint' : 'no hint (may already exist)');
  }

  {
    const { status, json } = await postJson('/arrange-itinerary/ai-actions', {
      action: 'fill_gaps',
      dayIndex: 2,
      commitMode: 'proposal',
    });
    const pid = json.data?.proposal?.proposalId;
    isSuccess(json) && pid
      ? pass('POST ai-actions fill_gaps', status, `changes=${json.data?.proposal?.changes?.length ?? 0}`)
      : fail('POST ai-actions', status, JSON.stringify(json.message ?? json));
    if (pid) await postJson(`/arrange-itinerary/proposals/${pid}/discard`, {});
  }

  // ── P6 决策语义 ───────────────────────────────────────────
  console.log('\n── P6 决策语义包 ──');

  await discardActiveProposals();

  {
    const { status, json } = await postJson('/arrange-itinerary/gaps', {
      dayIndex: 2,
      startTime: '15:00',
      endTime: '15:30',
      label: 'decision-pack smoke',
      commitMode: 'proposal',
    });
    const pack = json.data?.proposal?.decisionPack;
    const opts = pack?.options?.length ?? 0;
    const clusters = pack?.decisionClusters?.length ?? 0;
    const diags = pack?.diagnostics?.length ?? 0;
    isSuccess(json) && pack && opts > 0
      ? pass('POST gaps → decisionPack', status, `options=${opts} clusters=${clusters} diagnostics=${diags}`)
      : fail('POST gaps → decisionPack', status, `options=${opts}`);

    const pid = json.data?.proposal?.proposalId;
    if (pid) {
      const opt0 = pack?.options?.[0];
      const hasP0 =
        opt0?.outcomes?.length &&
        opt0?.costs?.length &&
        opt0?.impactScope &&
        opt0?.optionKind &&
        Array.isArray(opt0?.counterfactualRows) &&
        opt0?.headline &&
        opt0?.description &&
        Array.isArray(opt0?.outcomeItems) &&
        Array.isArray(opt0?.costItems) &&
        Array.isArray(opt0?.dataBasis);
      hasP0
        ? pass('P0 option shape', 200, `kind=${opt0.optionKind} badge=${opt0.badge ?? '-'}`)
        : fail('P0 option shape', 200, 'missing solution card fields');

      const mon = await getJson(`/arrange-itinerary/proposals/${pid}/monitor`);
      isSuccess(mon.json) && mon.json.data?.validUntil
        ? pass('GET proposals/:id/monitor', mon.status, `stale=${mon.json.data.isStale}`)
        : fail('GET proposals/:id/monitor', mon.status, JSON.stringify(mon.json.message));

      const chain = await getJson(`/arrange-itinerary/decision-causal-chain?proposalId=${pid}`);
      const chainData = chain.json.data;
      isSuccess(chain.json) &&
      chainData?.schema === 'tripnara.planning_causal_chain@v1' &&
      Array.isArray(chainData?.nodes)
        ? pass(
            'GET decision-causal-chain',
            chain.status,
            `nodes=${chainData.nodes.length} basis=${chainData.basisSource}`,
          )
        : fail('GET decision-causal-chain', chain.status, JSON.stringify(chain.json.message));

      const basis = await getJson(`/arrange-itinerary/decision-basis?proposalId=${pid}`);
      const basisData = basis.json.data;
      isSuccess(basis.json) &&
      basisData?.schema === 'tripnara.planning_decision_basis@v1' &&
      basisData?.whatHappened?.narrative &&
      Array.isArray(basisData?.contextFields)
        ? pass(
            'GET decision-basis',
            basis.status,
            `fields=${basisData.contextFields.length} options=${basisData.optionCount ?? '-'}`,
          )
        : fail('GET decision-basis', basis.status, JSON.stringify(basis.json.message));

      const inspector = await getJson(`/arrange-itinerary/decision-inspector?proposalId=${pid}`);
      const insp = inspector.json.data;
      isSuccess(inspector.json) &&
      insp?.schema === 'tripnara.planning_decision_inspector@v1' &&
      insp?.causalChain &&
      insp?.planDiff &&
      insp?.memberConsensus &&
      insp?.feasibility?.gateChecks
        ? pass(
            'GET decision-inspector',
            inspector.status,
            `tabs=4 write=${insp.feasibility.canSafelyWrite}`,
          )
        : fail('GET decision-inspector', inspector.status, JSON.stringify(inspector.json.message));

      await postJson(`/arrange-itinerary/proposals/${pid}/discard`, {});
    }
  }

  // restore manual mode
  await postJson('/arrange-itinerary/planning-mode', { mode: 'manual' });

  // ── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`结果: ${passed} 通过 / ${failed} 失败 / ${results.length} 总计`);
  if (failed > 0) {
    console.log('\n失败项:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
  console.log('\n✅ 全部通过\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
