#!/usr/bin/env npx tsx
/**
 * 测试 Anthropic API（通过代理）
 *
 * 用法:
 *   # 方式1: 服务已启动，指定使用 Anthropic
 *   LLM_PROVIDER=anthropic npx tsx scripts/test-anthropic-proxy.ts
 *
 *   # 方式2: 直接调用 LLM 接口（需服务运行）
 *   API_BASE_URL=http://localhost:3000 LLM_PROVIDER=anthropic npx tsx scripts/test-anthropic-proxy.ts
 *
 * 环境变量:
 *   - ANTHROPIC_BASE_URL: 代理地址，如 https://hongmacc.com/api
 *   - ANTHROPIC_API_KEY: API Key
 *   - LLM_PROVIDER: 设为 anthropic 以使用 Anthropic
 */

import axios from 'axios';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function main() {
  console.log('=== Anthropic 代理测试 ===\n');
  console.log('配置:');
  console.log('  API_BASE_URL:', BASE);
  console.log('  ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '(未设置，使用默认 api.anthropic.com)');
  console.log('  LLM_PROVIDER:', process.env.LLM_PROVIDER || '(未设置)');
  console.log('');

  // 1. 调用 natural-language-to-params，强制使用 anthropic
  console.log('1. POST /api/llm/natural-language-to-params (provider=anthropic)');
  try {
    const { data } = await axios.post(
      `${BASE}/api/llm/natural-language-to-params`,
      {
        text: '杭州千岛湖4天春日小度假，预算8000，放松看湖景',
        provider: 'anthropic',
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );

    if (data?.success && data?.data) {
      console.log('   ✅ 成功');
      const p = data.data.params || data.data;
      console.log('   解析结果:');
      console.log('     destination:', p.destination);
      console.log('     cities:', p.cities);
      console.log('     dayAllocation:', p.dayAllocation);
      console.log('     totalBudget:', p.totalBudget);
      console.log('     needsClarification:', p.needsClarification);
    } else {
      console.log('   ⚠️ 响应异常:', JSON.stringify(data).slice(0, 200));
    }
  } catch (e: any) {
    const msg = e.response?.data?.message || e.message || String(e);
    const status = e.response?.status;
    console.log('   ❌ 失败:', msg);
    if (status) console.log('   HTTP:', status);
    if (status === 401) console.log('   (401: 需登录，可改用 from-natural-language + X-Test-User-Id)');
    if (status === 503) console.log('   (503: 代理服务可能不可用，请检查 ANTHROPIC_BASE_URL)');
    if (e.code === 'ECONNREFUSED') console.log('   (连接被拒: 请先启动服务 npm run dev)');
  }

  // 2. 调用 from-natural-language（使用服务默认 provider，需 LLM_PROVIDER=anthropic）
  console.log('\n2. POST /api/trips/from-natural-language (使用服务默认 LLM)');
  try {
    const { data } = await axios.post(
      `${BASE}/api/trips/from-natural-language`,
      {
        text: '杭州千岛湖4天，预算8000',
        isNewConversation: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': 'test-anthropic-proxy',
        },
        timeout: 90000,
      }
    );

    if (data?.success !== false) {
      const d = data?.data || data;
      console.log('   ✅ 成功');
      console.log('   needsClarification:', d.needsClarification);
      console.log('   clarificationQuestions:', d.clarificationQuestions?.length ?? 0);
      if (d.plannerReply) {
        console.log('   plannerReply:', d.plannerReply.slice(0, 80) + '...');
      }
    } else {
      console.log('   ⚠️ 响应:', JSON.stringify(data).slice(0, 300));
    }
  } catch (e: any) {
    const msg = e.response?.data?.message || e.message || String(e);
    const status = e.response?.status;
    console.log('   ❌ 失败:', msg);
    if (status) console.log('   HTTP:', status);
    if (status === 503) console.log('   (503: 代理可能不可用)');
    if (e.code === 'ECONNREFUSED') console.log('   (连接被拒: 请先启动服务 npm run dev)');
  }

  console.log('\n=== 测试完成 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
