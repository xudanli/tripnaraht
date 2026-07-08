#!/usr/bin/env npx ts-node
/**
 * 方案卡（decisionPack.options）接口联调测试
 *
 * 覆盖路径：
 *   1. POST gaps → proposal.decisionPack.options
 *   2. POST analyze-move → proposal.decisionPack.options
 *   3. GET decision-basis?proposalId=…（optionCount + 关联草案）
 *
 * Usage:
 *   npx ts-node scripts/plan-option-solution-card-test.ts [tripId] [baseUrl]
 */
const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const api = `${baseUrl}/api/trips/${tripId}`;
const arrange = `${api}/arrange-itinerary`;

type Option = {
  id?: string;
  optionKind?: string;
  badge?: string;
  letter?: string;
  headline?: string;
  description?: string;
  title?: string;
  recommended?: boolean;
  outcomes?: string[];
  costs?: string[];
  outcomeItems?: Array<{ id: string; text: string; tone: string }>;
  costItems?: Array<{ id: string; text: string; tone: string }>;
  dataBasis?: Array<{ id: string; label: string; icon?: string; reliability?: string }>;
  impactScope?: unknown;
  counterfactualRows?: unknown[];
};

function unwrap<T>(json: Record<string, unknown>): T | undefined {
  if (json.success === true && json.data) return json.data as T;
  return json as T;
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

function isOkStatus(status: number) {
  return status === 200 || status === 201;
}

function validateSolutionCard(opt: Option, label: string): string[] {
  const errors: string[] = [];
  const skipBadge = opt.id?.endsWith('_discard') || opt.id?.endsWith('_accept_risk');
  const required: Array<keyof Option> = [
    'optionKind',
    'headline',
    'description',
    'outcomeItems',
    'costItems',
    'dataBasis',
    'impactScope',
    'counterfactualRows',
  ];
  for (const key of required) {
    const val = opt[key];
    if (val === undefined || val === null) errors.push(`${label}: missing ${key}`);
    if (Array.isArray(val) && val.length === 0 && key !== 'counterfactualRows') {
      errors.push(`${label}: empty ${key}`);
    }
  }
  if (!skipBadge && !opt.badge && !opt.letter) errors.push(`${label}: missing badge/letter`);
  if (!opt.outcomes?.length) errors.push(`${label}: missing outcomes[]`);
  if (!opt.costs?.length) errors.push(`${label}: missing costs[]`);
  if (opt.outcomes && opt.outcomeItems && opt.outcomes.length !== opt.outcomeItems.length) {
    errors.push(`${label}: outcomes/outcomeItems length mismatch`);
  }
  if (opt.costs && opt.costItems && opt.costs.length !== opt.costItems.length) {
    errors.push(`${label}: costs/costItems length mismatch`);
  }
  return errors;
}

function printOptionCard(opt: Option, index: number) {
  const badge = opt.badge ?? opt.letter ?? `方案 ${index + 1}`;
  const rec = opt.recommended ? ' [推荐]' : '';
  console.log(`\n  ┌─ ${badge}${rec} ─ ${opt.optionKind ?? '?'}`);
  console.log(`  │ ${opt.headline ?? opt.title ?? '(no headline)'}`);
  if (opt.description) console.log(`  │ ${opt.description}`);
  console.log('  │');
  console.log('  │ 预计结果 ✓');
  for (const o of opt.outcomeItems ?? []) {
    console.log(`  │   • ${o.text}`);
  }
  console.log('  │ 代价 •');
  for (const c of opt.costItems ?? []) {
    console.log(`  │   • ${c.text}`);
  }
  console.log('  │');
  const basis = (opt.dataBasis ?? []).map((b) => `${b.icon ?? '?'}:${b.label}`).join(' · ');
  console.log(`  └─ 数据依据: ${basis || '—'}`);
}

async function discardProposal(proposalId: string) {
  await postJson(`/proposals/${proposalId}/discard`, {});
}

async function main() {
  console.log(`Trip: ${tripId}`);
  const allErrors: string[] = [];
  let tested = 0;

  // ── 1. gaps → decisionPack ───────────────────────────────
  console.log('\n── 1. POST gaps → decisionPack.options ──');
  const gaps = await postJson('/gaps', {
    dayIndex: 2,
    startTime: '15:00',
    endTime: '15:30',
    label: 'solution-card test',
    commitMode: 'proposal',
  });
  const gapsData = unwrap<{ proposal?: { proposalId?: string; decisionPack?: { schema?: string; options?: Option[] } } }>(
    gaps.json,
  );
  const gapsPack = gapsData?.proposal?.decisionPack;
  const gapsOpts = gapsPack?.options?.filter((o) => !o.id?.endsWith('_discard')) ?? [];

  if (!isOkStatus(gaps.status) || gaps.json.success === false) {
    allErrors.push(`gaps: HTTP ${gaps.status} ${JSON.stringify(gaps.json)}`);
  } else if (!gapsOpts.length) {
    allErrors.push('gaps: no options in decisionPack');
  } else {
    console.log(`  schema: ${gapsPack?.schema ?? '—'}`);
    console.log(`  options: ${gapsOpts.length}`);
    for (let i = 0; i < gapsOpts.length; i++) {
      printOptionCard(gapsOpts[i]!, i);
      allErrors.push(...validateSolutionCard(gapsOpts[i]!, `gaps[${i}]`));
      tested++;
    }
    const pid = gapsData?.proposal?.proposalId;
    if (pid) {
      const basis = await getJson(`/decision-basis?proposalId=${pid}`);
      const basisData = unwrap<{ optionCount?: number; schema?: string }>(basis.json);
      if (basisData?.schema === 'tripnara.planning_decision_basis@v1') {
        console.log(`\n  decision-basis optionCount: ${basisData.optionCount ?? '—'}`);
      }
      await discardProposal(pid);
    }
  }

  // ── 2. analyze-move → decisionPack ───────────────────────
  console.log('\n── 2. POST analyze-move → decisionPack.options ──');
  const timeline = await fetch(`${api}/schedule-timeline?include=items`);
  const tlJson = (await timeline.json()) as Record<string, unknown>;
  const tlData = unwrap<{ days?: Array<{ itineraryItems?: Array<{ id: string; name?: string }> }> }>(tlJson);
  const item = tlData?.days?.[0]?.itineraryItems?.[0];

  if (!item?.id) {
    console.log('  skip: no itinerary item on day 1');
  } else {
    console.log(`  item: ${item.name ?? item.id.slice(0, 8)}…`);
    const move = await postJson(`/items/${item.id}/analyze-move`, {
      dayIndex: 1,
      startTime: '16:00',
      endTime: '17:30',
      commitMode: 'proposal',
    });
    const moveData = unwrap<{ proposal?: { proposalId?: string; decisionPack?: { options?: Option[] } } }>(
      move.json,
    );
    const moveOpts = moveData?.proposal?.decisionPack?.options?.filter((o) => !o.id?.endsWith('_discard')) ?? [];

    if (!isOkStatus(move.status) || move.json.success === false) {
      allErrors.push(`analyze-move: HTTP ${move.status}`);
    } else if (!moveOpts.length) {
      allErrors.push('analyze-move: no options in decisionPack');
    } else {
      console.log(`  options: ${moveOpts.length}`);
      for (let i = 0; i < moveOpts.length; i++) {
        printOptionCard(moveOpts[i]!, i);
        allErrors.push(...validateSolutionCard(moveOpts[i]!, `analyze-move[${i}]`));
        tested++;
      }
      const pid = moveData?.proposal?.proposalId;
      if (pid) await discardProposal(pid);
    }
  }

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  if (allErrors.length === 0 && tested > 0) {
    console.log(`✅ 方案卡测试通过 — ${tested} 张方案卡字段完整`);
    return;
  }
  if (tested === 0) {
    console.log('❌ 未生成任何方案卡');
    process.exit(1);
  }
  console.log(`❌ ${allErrors.length} 项问题（已测 ${tested} 张）:`);
  for (const e of allErrors) console.log(`  • ${e}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
