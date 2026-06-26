#!/usr/bin/env npx tsx
/**
 * Guardian 前后端联调冒烟 — 三场景：
 * 1. guardian/choose → presentation
 * 2. Planning Assistant → personaEvaluation.presentation
 * 3. Workbench execute → uiOutput.presentation
 */
export {};

const BASE = process.env.API_URL || 'http://localhost:3000';
const TRIP_ID =
  process.env.TEST_TRIP_ID || 'c7201f41-bb9f-4961-9512-1c98d9d301e2';

type Check = { name: string; ok: boolean; detail: string };

async function req(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 120000,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function hasPresentation(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const p = (obj as Record<string, unknown>).presentation;
  return (
    !!p &&
    typeof p === 'object' &&
    typeof (p as Record<string, unknown>).narrative === 'string' &&
    typeof (p as Record<string, unknown>).leadSpeaker === 'string'
  );
}

async function waitForHealth(maxMs = 90000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function scenarioChoosePresentation(checks: Check[]): Promise<void> {
  // 先跑 Workbench 产生 CHOOSE presentation（测试行程 negotiation 常为 APPROVE_WITH_CONDITIONS）
  const wb = await req('POST', '/api/planning-workbench/execute', {
    tripId: TRIP_ID,
    userAction: 'generate',
    context: {
      destination: { country: 'IS', region: 'South Iceland' },
      days: 5,
      travelMode: 'self_drive',
    },
  }, 180000);

  const wbWrapped = (wb.data ?? {}) as Record<string, unknown>;
  const wbInner = (wbWrapped.data ?? wbWrapped) as Record<string, unknown>;
  const ui = wbInner.uiOutput as Record<string, unknown> | undefined;
  const presentation = ui?.presentation as Record<string, unknown> | undefined;
  const userAction = (presentation?.actions as Record<string, unknown> | undefined)?.user;

  checks.push({
    name: '1a Workbench 产生 presentation',
    ok: hasPresentation(ui) || hasPresentation({ presentation }),
    detail: userAction
      ? `leadSpeaker=${(presentation ?? ui?.presentation as Record<string, unknown>)?.leadSpeaker}, action=${userAction}`
      : '无 presentation',
  });

  const decisionPoints =
    (wbInner.consolidatedDecision as Record<string, unknown> | undefined)?.nextSteps as
      | string[]
      | undefined;
  const points =
    Array.isArray(decisionPoints) && decisionPoints.length
      ? decisionPoints.map(String)
      : ['接受当前方案', '调整节奏', '重新规划'];

  const choosePath = `/api/v2/trips/${TRIP_ID}/guardian/choose`;
  const choose = await req('POST', choosePath, {
    source: 'presentation',
    selectedIndex: 0,
    selectedText: points[0],
    decisionPoints: points,
    correlationId: `smoke-${Date.now()}`,
  });

  const chooseBody = (choose.data ?? {}) as Record<string, unknown>;
  checks.push({
    name: '1b guardian/choose HTTP 200',
    ok: choose.ok,
    detail: `status=${choose.status}, accepted=${chooseBody.accepted}, nextAction=${chooseBody.nextAction}`,
  });
  checks.push({
    name: '1c guardian/choose 返回 presentation',
    ok: hasPresentation(chooseBody),
    detail: hasPresentation(chooseBody)
      ? `leadSpeaker=${(chooseBody.presentation as Record<string, unknown>).leadSpeaker}`
      : JSON.stringify(chooseBody).slice(0, 120),
  });
}

async function scenarioPlanningAssistant(checks: Check[]): Promise<void> {
  const sessionR = await req('POST', '/api/agent/planning-assistant/sessions', {
    userId: 'guardian-smoke-user',
  });
  const sessionBody = (sessionR.data ?? {}) as Record<string, unknown>;
  const sessionId = sessionBody.sessionId as string | undefined;
  if (!sessionId) {
    checks.push({
      name: '2a 创建规划会话',
      ok: false,
      detail: JSON.stringify(sessionR.data).slice(0, 100),
    });
    return;
  }

  const chat = await req(
    'POST',
    '/api/agent/planning-assistant/chat',
    {
      sessionId,
      userId: 'guardian-smoke-user',
      message: '请为冰岛南部生成 5 天自驾行程方案',
      language: 'zh',
      context: {
        tripId: TRIP_ID,
        countryCode: 'IS',
      },
    },
    180000,
  );

  const chatBody = (chat.data ?? {}) as Record<string, unknown>;
  const pe = chatBody.personaEvaluation as Record<string, unknown> | undefined;
  checks.push({
    name: '2a Planning Assistant chat 200',
    ok: chat.ok,
    detail: `phase=${chatBody.phase}`,
  });
  const chatHasPe = !!pe && hasPresentation(pe);
  checks.push({
    name: '2b personaEvaluation.presentation (chat)',
    ok: chatHasPe,
    detail: chatHasPe
      ? `leadSpeaker=${(pe!.presentation as Record<string, unknown>).leadSpeaker}`
      : 'chat 未返回 personaEvaluation（需 selectedDestination + generate 才触发）',
  });

  // 回退：Workbench 侧 personas 结构应与 personaEvaluation 同型（前端联调参考）
  if (!chatHasPe) {
    const wb = await req('POST', '/api/planning-workbench/execute', {
      tripId: TRIP_ID,
      userAction: 'generate',
      context: {
        destination: { country: 'IS', region: 'South Iceland' },
        days: 5,
        travelMode: 'self_drive',
      },
    }, 180000);
    const wbInner = ((wb.data ?? {}) as Record<string, unknown>).data ?? wb.data;
    const personas = (wbInner as Record<string, unknown>)?.uiOutput as Record<string, unknown> | undefined;
    const shell = personas?.personas as Record<string, unknown> | undefined;
    checks.push({
      name: '2c personaEvaluation 结构回退 (workbench.personas)',
      ok: !!shell && hasPresentation(shell),
      detail: shell?.presentation
        ? `leadSpeaker=${(shell.presentation as Record<string, unknown>).leadSpeaker}（Planning Assistant 待映射）`
        : 'workbench 无 personas.presentation',
    });
  }
}

async function scenarioWorkbenchPresentation(checks: Check[]): Promise<void> {
  const wb = await req(
    'POST',
    '/api/planning-workbench/execute',
    {
      tripId: TRIP_ID,
      userAction: 'generate',
      context: {
        destination: { country: 'IS', region: 'South Iceland' },
        days: 5,
        travelMode: 'self_drive',
      },
    },
    180000,
  );

  const wrapped = (wb.data ?? {}) as Record<string, unknown>;
  const inner = (wrapped.data ?? wrapped) as Record<string, unknown>;
  const ui = inner.uiOutput as Record<string, unknown> | undefined;

  checks.push({
    name: '3a Workbench execute 200',
    ok: wb.ok,
    detail: `success=${wrapped.success ?? wb.ok}`,
  });
  checks.push({
    name: '3b uiOutput.presentation',
    ok: !!ui && hasPresentation(ui),
    detail: ui?.presentation
      ? `leadSpeaker=${(ui.presentation as Record<string, unknown>).leadSpeaker}`
      : ui?.personas
        ? '有 personas 无 presentation 别名'
        : '无 uiOutput.personas',
  });
}

async function main() {
  console.log(`\n🔗 Guardian 联调冒烟\nBASE=${BASE}\nTRIP_ID=${TRIP_ID}\n`);

  if (!(await waitForHealth())) {
    console.error('❌ 服务器未就绪。请先启动:');
    console.error('  npx ts-node --transpile-only -r tsconfig-paths/register src/main.ts');
    process.exit(1);
  }
  console.log('✅ 服务器健康\n');

  const checks: Check[] = [];

  console.log('— 场景 1: guardian/choose → presentation');
  await scenarioChoosePresentation(checks);

  console.log('— 场景 2: Planning Assistant → personaEvaluation.presentation');
  await scenarioPlanningAssistant(checks);

  console.log('— 场景 3: Workbench → uiOutput.presentation');
  await scenarioWorkbenchPresentation(checks);

  console.log('\n' + '─'.repeat(60));
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
    console.log(`   ${c.detail}`);
  }
  console.log('─'.repeat(60));

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n📊 ${passed}/${checks.length} 检查通过\n`);

  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
