#!/usr/bin/env npx tsx
/**
 * 测试专利技术交底书中的场景：新西兰 5 天自驾游
 *
 * 专利场景（docs/专利技术交底书_Decision_OS_母专利.md 391-445）：
 * 用户输入：「帮我规划一次新西兰 5 天自驾游，从奥克兰出发，想去皇后镇和米尔福德峡湾」
 *
 * 预期流程：INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → OPTIMIZE → VERIFY → 输出
 *
 * 本脚本通过以下接口测试：
 * 1. POST /api/trips/from-natural-language - 自然语言创建行程（解析 + 澄清 + 创建）
 * 2. （可选）POST /api/agent/route_and_run - 完整 Agent 编排
 *
 * 用法: API_BASE_URL=http://localhost:3000 npx tsx scripts/test-patent-nz-scenario.ts
 */

import axios from 'axios';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// 专利中的用户输入
const PATENT_USER_INPUT =
  '帮我规划一次新西兰 5 天自驾游，从奥克兰出发，想去皇后镇和米尔福德峡湾';

async function getTestToken(): Promise<string | undefined> {
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || '2IP2XCg6n09uHfMlhXmEd1jJEAQcPDGfftnQXFEWc3g';
    return jwt.sign({ sub: 'test-patent-user' }, secret, { expiresIn: '1h' });
  } catch {
    return undefined;
  }
}

async function postFromNL(text: string, sessionId?: string, isNew = false) {
  const token = await getTestToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const { data } = await axios.post(
    `${BASE}/api/trips/from-natural-language`,
    { text, sessionId: sessionId || undefined, isNewConversation: isNew },
    { headers, timeout: 120000 }
  );
  return data;
}

async function postConfirmCreate(sessionId: string) {
  const token = await getTestToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const { data } = await axios.post(
    `${BASE}/api/trips/nl-conversation/${sessionId}/confirm-create`,
    { confirm: true },
    { headers, timeout: 120000 }
  );
  return data;
}

async function postRouteAndRun(message: string, options?: { trip_id?: string }) {
  const { data } = await axios.post(
    `${BASE}/api/agent/route_and_run`,
    {
      request_id: `test_patent_${Date.now()}`,
      user_id: 'test-user-patent',
      message,
      trip_id: options?.trip_id,
      options: { max_seconds: 90, max_steps: 12 },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
  );
  return data;
}

async function main() {
  console.log('========================================');
  console.log('专利场景测试：新西兰 5 天自驾游');
  console.log('========================================\n');

  console.log('【用户输入】');
  console.log(`> "${PATENT_USER_INPUT}"\n`);

  const sid = `test_patent_${Date.now()}`;

  // ========== 测试 1: from-natural-language ==========
  console.log('【测试 1】POST /api/trips/from-natural-language\n');

  try {
    const r1 = await postFromNL(PATENT_USER_INPUT, sid, true);
    const session = r1.data?.sessionId || r1.sessionId;
    const needsClarification = r1.data?.needsClarification ?? r1.needsClarification;
    const trip = r1.data?.trip ?? r1.trip;
    const plannerReply = r1.data?.plannerReply ?? r1.plannerReply;
    const questions = r1.data?.clarificationQuestions ?? r1.clarificationQuestions ?? [];
    const partialParams = r1.data?.partialParams ?? r1.partialParams;

    console.log('  success:', r1.success ?? true);
    console.log('  sessionId:', session);
    console.log('  needsClarification:', needsClarification);
    console.log('  trip 已创建:', !!trip);
    if (trip) {
      console.log('    - tripId:', trip.id);
      console.log('    - destination:', trip.destination);
      console.log('    - 天数:', trip.days?.length ?? '-');
    }
    console.log('  澄清问题数:', questions.length);
    if (questions.length > 0) {
      questions.slice(0, 3).forEach((q: any, i: number) => {
        console.log(`    [${i + 1}] ${q.id}: ${(q.question || q.title || '').slice(0, 50)}...`);
      });
    }
    if (partialParams && Object.keys(partialParams).length > 0) {
      console.log('  已解析参数:', JSON.stringify(partialParams, null, 2).slice(0, 300) + '...');
    }
    if (plannerReply) {
      console.log('\n  规划师回复（前200字）:', plannerReply.slice(0, 200) + '...');
    }

    // 若需要澄清，多轮对话直至行程创建或不再需要澄清
    let currentSession = session;
    let lastResp = r1;
    const rounds = [
      { msg: '2026年3月15日出发，预算4万人民币，两人出行', label: '补充日期和预算' },
      { msg: '确认', label: '确认推断信息' },
      { msg: '都对，以上信息正确', label: '再次确认' },
    ];

    for (let i = 0; i < rounds.length && currentSession && !(lastResp.data?.trip ?? lastResp.trip); i++) {
      const needClarify = lastResp.data?.needsClarification ?? lastResp.needsClarification;
      if (!needClarify) break;

      console.log(`\n  → 第 ${i + 2} 轮：${rounds[i].label}...\n`);
      lastResp = await postFromNL(rounds[i].msg, currentSession);
      currentSession = lastResp.data?.sessionId || lastResp.sessionId;
      const tripCreated = lastResp.data?.trip ?? lastResp.trip;

      if (tripCreated) {
        console.log('  ✓ 行程已创建:', tripCreated.id);
        console.log('    destination:', tripCreated.destination);
        console.log('    天数:', tripCreated.days?.length ?? '-');
        break;
      }
      const qCount = (lastResp.data?.clarificationQuestions ?? []).length;
      const needClarifyNow = lastResp.data?.needsClarification ?? lastResp.needsClarification;
      const needConfirm = lastResp.data?.needsConfirmation ?? lastResp.needsConfirmation;
      console.log('  needsClarification:', needClarifyNow, '| needsConfirmation:', needConfirm, '| 问题数:', qCount);

      // 若无需澄清（且可能需要确认），调用 confirm-create 创建行程
      if (!needClarifyNow && currentSession && !(lastResp.data?.trip ?? lastResp.trip)) {
        console.log('\n  → 调用 confirm-create 创建行程...\n');
        const confirmResp = await postConfirmCreate(currentSession);
        const tripFromConfirm = confirmResp.data?.trip ?? confirmResp.trip;
        if (tripFromConfirm) {
          console.log('  ✓ 行程已创建:', tripFromConfirm.id);
          console.log('    destination:', tripFromConfirm.destination);
          console.log('    天数:', tripFromConfirm.days?.length ?? '-');
        } else {
          console.log('  confirm-create 响应:', JSON.stringify(confirmResp).slice(0, 200));
        }
        break;
      }
    }
  } catch (e: any) {
    const msg = e.response?.data?.message ?? e.message;
    const status = e.response?.status;
    const code = e.code || e.errno;
    console.error('  ✗ 请求失败:', status ? `HTTP ${status}` : code || '', msg || e.toString());
    if (code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')) {
      console.error('\n  → 服务未启动，请先运行: npm run start:dev');
    } else if (status === 404 && msg?.includes('路线方向')) {
      console.error('\n  → 新西兰(NZ)可能暂无 RouteDirection 数据，请先导入 NZ 路线方向。');
    }
  }

  // ========== 测试 2: route_and_run（可选） ==========
  console.log('\n========================================');
  console.log('【测试 2】POST /api/agent/route_and_run\n');

  try {
    const agentResp = await postRouteAndRun(PATENT_USER_INPUT);
    const result = agentResp.result ?? agentResp;
    const status = result.status;
    const answer = result.answer_text ?? result.payload?.text;

    console.log('  status:', status);
    if (status === 'REDIRECT_REQUIRED') {
      console.log('  → 规划请求被重定向到 from-natural-language（预期行为）');
      console.log('  redirect_reason:', result.redirect_reason ?? '-');
    } else if (answer) {
      console.log('  answer_text 前300字:', String(answer).slice(0, 300) + '...');
    }
    if (agentResp.explain?.decision_log?.length) {
      console.log('  decision_log 步数:', agentResp.explain.decision_log.length);
    }
  } catch (e: any) {
    const msg = e.response?.data?.message ?? e.message;
    const code = e.code || e.errno;
    console.error('  ✗ 请求失败:', code || '', msg || e.toString());
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
