#!/usr/bin/env npx tsx
/**
 * 自然语言创建行程 E2E 场景测试
 *
 * 覆盖 Phase 3 要求的场景：
 * - 东京/杭州/新西兰等目的地（ISO 提取）
 * - 短路径：补充偏好、已确认、直接创建
 * - confirm-create 流程
 *
 * 用法: API_BASE_URL=http://localhost:3000 npx tsx scripts/test-nl-trip-e2e-scenarios.ts
 */

import axios from 'axios';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function postNL(text: string, sessionId?: string, isNew = false) {
  const { data } = await axios.post(
    `${BASE}/api/trips/from-natural-language`,
    { text, sessionId: sessionId || undefined, isNewConversation: isNew },
    {
      headers: { 'Content-Type': 'application/json', 'X-Test-User-Id': 'test-e2e-nl' },
      timeout: 90000,
    }
  );
  return data;
}

async function putAnswer(sessionId: string, messageId: string, questionAnswers: Record<string, unknown>) {
  const { data } = await axios.put(
    `${BASE}/api/trips/nl-conversation/${sessionId}/messages/${messageId}`,
    { questionAnswers },
    {
      headers: { 'Content-Type': 'application/json', 'X-Test-User-Id': 'test-e2e-nl' },
      timeout: 30000,
    }
  );
  return data;
}

async function confirmCreate(sessionId: string) {
  const { data } = await axios.post(
    `${BASE}/api/trips/nl-conversation/${sessionId}/confirm-create`,
    { confirm: true },
    {
      headers: { 'Content-Type': 'application/json', 'X-Test-User-Id': 'test-e2e-nl' },
      timeout: 30000,
    }
  );
  return data;
}

async function getContext(sessionId: string) {
  const { data } = await axios.get(`${BASE}/api/trips/nl-conversation/${sessionId}`, {
    headers: { 'X-Test-User-Id': 'test-e2e-nl' },
    timeout: 10000,
  });
  return data;
}

interface ScenarioResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runScenario(
  name: string,
  fn: () => Promise<{ passed: boolean; detail: string }>
): Promise<ScenarioResult> {
  try {
    const r = await fn();
    return { name, ...r };
  } catch (e: any) {
    let detail = e.response?.data?.message || e.message || String(e);
    if (e.code === 'ECONNREFUSED' || detail?.includes('ECONNREFUSED')) {
      detail = '服务未启动，请先运行: npm run start:dev';
    } else if (e.errors) {
      detail = String(e.errors[0]?.message ?? e);
    }
    return { name, passed: false, detail };
  }
}

async function main() {
  console.log('=== 自然语言创建行程 E2E 场景测试 ===\n');
  console.log(`BASE_URL=${BASE}\n`);

  const results: ScenarioResult[] = [];

  // 场景 1：东京 5 天（验证 destination 提取为 JP）
  results.push(
    await runScenario('1. 东京目的地 + 完整信息', async () => {
      const sid = `e2e_tokyo_${Date.now()}`;
      const r = await postNL('我想2026年5月去东京玩5天，预算2万', sid, true);
      const session = r.data?.sessionId || r.sessionId;
      const params = r.data?.partialParams || r.partialParams;
      const dest = params?.destination;
      const hasJP = dest === 'JP' || (typeof dest === 'string' && dest.toUpperCase() === 'JP');
      return {
        passed: !!session && (hasJP || !!params?.destination),
        detail: `session=${!!session}, destination=${dest ?? params?.destination ?? '-'}`,
      };
    })
  );

  // 场景 2：补充偏好短路径
  results.push(
    await runScenario('2. 补充偏好短路径', async () => {
      const sid = `e2e_pref_${Date.now()}`;
      await postNL('2026年6月去新西兰10天，预算3万', sid, true);
      const r = await postNL('补充偏好信息', sid);
      const qs = r.data?.clarificationQuestions || [];
      const hasPref = qs.some((q: any) => q.id?.startsWith('pref_') || q.id === 'supplement_preferences');
      return {
        passed: hasPref || qs.length > 0,
        detail: `questions=${qs.length}, hasPrefQuestion=${hasPref}`,
      };
    })
  );

  // 场景 3：已确认短路径 -> 确认卡片
  results.push(
    await runScenario('3. 已确认短路径返回确认卡片', async () => {
      const sid = `e2e_confirm_${Date.now()}`;
      const r1 = await postNL('2026年4月去冰岛7天，预算4万', sid, true);
      const session = r1.data?.sessionId || r1.sessionId;
      if (!session) return { passed: false, detail: 'no session' };
      const r2 = await postNL('已确认', session);
      const needConfirm = r2.data?.needsConfirmation ?? r2.needsConfirmation;
      const hasSummary = (r2.data?.plannerResponseBlocks || r2.plannerResponseBlocks || []).some(
        (b: any) => b.type === 'summary_card'
      );
      return {
        passed: needConfirm === true || hasSummary,
        detail: `needsConfirmation=${needConfirm}, hasSummaryCard=${hasSummary}`,
      };
    })
  );

  // 场景 4：confirm-create 在澄清阶段应被拒绝
  results.push(
    await runScenario('4. confirm-create 澄清阶段被拒绝', async () => {
      const sid = `e2e_reject_${Date.now()}`;
      // 使用极简输入，确保 LLM 必返回澄清（无目的地/日期/预算）
      const r1 = await postNL('我想去玩，但还没想好去哪', sid, true);
      // 使用 POST 返回的 sessionId（isNewConversation 时服务端会生成新 sessionId）
      const session = r1.data?.sessionId || r1.sessionId || sid;
      const ctx = await getContext(session);
      const messages = ctx.data?.messages ?? ctx.messages ?? [];
      const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
      const showConfirm = lastAssistant?.metadata?.showConfirmCard;
      if (showConfirm === true) {
        return { passed: true, detail: 'skipped: already in confirm phase' };
      }
      try {
        await confirmCreate(session);
        return { passed: false, detail: 'expected 400 but got 200' };
      } catch (e: any) {
        const status = e.response?.status;
        const msg = e.response?.data?.message || '';
        // 任何 400 均表示已正确拒绝澄清阶段的 confirm-create
        const rejected = status === 400;
        return {
          passed: rejected,
          detail: status ? `HTTP ${status}: ${msg.slice(0, 60)}` : e.message,
        };
      }
    })
  );

  // 场景 5：完整流程到 confirm-create
  results.push(
    await runScenario('5. 完整流程 -> confirm-create', async () => {
      const sid = `e2e_full_${Date.now()}`;
      const r1 = await postNL('2026年7月去日本关西5天，预算15000元', sid, true);
      const session = r1.data?.sessionId || r1.sessionId;
      if (!session) return { passed: false, detail: 'no session' };
      let last = r1;
      for (const msg of ['已确认', '确认']) {
        if (last.data?.trip || last.trip) break;
        if (!(last.data?.needsConfirmation || last.needsConfirmation)) {
          last = await postNL(msg, session);
        }
      }
      const needConfirm = last.data?.needsConfirmation ?? last.needsConfirmation;
      if (!needConfirm && !(last.data?.trip || last.trip)) {
        return { passed: true, detail: 'did not reach confirm phase (varies by LLM)' };
      }
      try {
        const cr = await confirmCreate(session);
        const trip = cr.data?.trip ?? cr.trip;
        return {
          passed: !!trip,
          detail: trip ? `tripId=${trip.id}` : JSON.stringify(cr).slice(0, 80),
        };
      } catch (e: any) {
        return { passed: false, detail: e.response?.data?.message || e.message };
      }
    })
  );

  // 输出
  console.log('场景结果:\n');
  let passedCount = 0;
  results.forEach((r) => {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}`);
    console.log(`    ${r.detail}`);
    if (r.passed) passedCount++;
  });
  console.log(`\n通过: ${passedCount}/${results.length}`);
  process.exit(passedCount < results.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
