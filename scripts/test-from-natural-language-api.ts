#!/usr/bin/env npx tsx
/**
 * 测试 POST /api/trips/from-natural-language 接口
 * 验证 conditionalInputs、clarificationQuestions 等结构
 *
 * 用法: API_BASE_URL=http://localhost:3000 npx tsx scripts/test-from-natural-language-api.ts
 */

import axios from 'axios';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function post(text: string, sessionId?: string, isNew = false) {
  const { data } = await axios.post(
    `${BASE}/api/trips/from-natural-language`,
    { text, sessionId: sessionId || undefined, isNewConversation: isNew },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Test-User-Id': 'test-user-nl-api', // 测试模式，免登录
      },
      timeout: 90000,
    }
  );
  return data;
}

async function main() {
  console.log('=== 测试 from-natural-language 接口 ===\n');
  const sid = `test_${Date.now()}`;

  // 1. 新对话：完整信息（目的+日期+预算）
  console.log('1. POST: 我想2026年4月去新西兰旅行10天，预算3万');
  const r1 = await post('我想2026年4月去新西兰旅行10天，预算3万', sid, true);
  const session = r1.data?.sessionId || r1.sessionId;
  console.log('   success:', r1.success);
  console.log('   sessionId:', session);
  console.log('   needsClarification:', r1.data?.needsClarification);

  const qs = r1.data?.clarificationQuestions || [];
  console.log('   clarificationQuestions:', qs.length);

  const supp = qs.find((q: any) => q.id === 'supplement_preferences');
  if (supp) {
    console.log('\n   ✓ supplement_preferences 存在');
    console.log('   conditionalInputs 数量:', supp.conditionalInputs?.length ?? 0);
    supp.conditionalInputs?.forEach((c: any, i: number) => {
      console.log(`     [${i}] triggerValue=${c.triggerValue}, paramKey=${c.paramKey}, label=${c.label?.slice(0, 20)}...`);
    });
  } else {
    console.log('   (supplement_preferences 本轮未出现，可能在后续轮次)');
    qs.slice(0, 2).forEach((q: any) => {
      if (q.conditionalInputs?.length) {
        console.log(`   问题 "${q.id}" 含 conditionalInputs:`, q.conditionalInputs.length);
      }
    });
  }

  // 2. 同一 session 发「补充偏好信息」触发短路径
  if (session) {
    console.log('\n2. POST: 补充偏好信息（如活动、节奏等）');
    const r2 = await post('补充偏好信息（如活动、节奏等）', session);
    const qs2 = r2.data?.clarificationQuestions || [];
    const supp2 = qs2.find((q: any) => q.id === 'supplement_preferences' || q.id?.startsWith('pref_'));
    if (supp2) {
      console.log('   ✓ 偏好问题:', supp2.id);
      console.log('   conditionalInputs:', supp2.conditionalInputs?.length ?? 0);
      if (supp2.conditionalInputs?.length) {
        supp2.conditionalInputs.forEach((c: any) =>
          console.log(`     - ${c.paramKey}: ${c.label}`)
        );
      }
    } else {
      console.log('   返回问题数:', qs2.length);
    }
  }

  console.log('\n=== 测试完成 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
