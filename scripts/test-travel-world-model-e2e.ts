#!/usr/bin/env npx tsx
/**
 * Travel World Model 端到端验证脚本
 *
 * 调用 POST /api/trips/draft（useAlgorithmicDraft: true）验证全流程：
 * CandidateRetrieval → RouteOptimization（含 PlaceGraph、District、TravelSimulation）→ 草案输出
 *
 * 使用方法:
 *   1. 先启动服务器: npm run start:dev
 *   2. 运行测试: npx tsx scripts/test-travel-world-model-e2e.ts
 *
 * 环境变量:
 *   API_URL - API 服务器地址（默认: http://localhost:3000）
 *   DESTINATION - 国家代码（默认: IS 冰岛，需有 Place 数据）
 */

export {};

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const DESTINATION = process.env.DESTINATION || 'IS';

async function main() {
  console.log(`Travel World Model E2E: POST ${BASE_URL}/api/trips/draft`);
  console.log(`  目的地: ${DESTINATION}, 算法编排: true\n`);

  const body = {
    destination: DESTINATION,
    days: 3,
    useAlgorithmicDraft: true,
    startDate: '2026-06-01',
    style: 'nature',
    intensity: 'balanced',
    transport: 'car', // 冰岛等自驾目的地，距离/疲劳按自驾阈值
  };

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/trips/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - start;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error(`❌ 请求失败: ${res.status} ${res.statusText}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const ok = data?.success !== false && data?.data;
  if (!ok) {
    console.error('❌ 响应格式异常');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const draft = data.data;
  const days = draft?.draftDays ?? [];

  // DraftDaySlots 是对象 { morning?, lunch?, afternoon?, dinner?, evening? }，非数组
  const slotKeys = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
  const toItems = (slots: any): Array<{ slot: string; item: any }> => {
    if (!slots || typeof slots !== 'object') return [];
    return slotKeys
      .map((k) => (slots[k] ? { slot: k, item: slots[k] } : null))
      .filter(Boolean) as Array<{ slot: string; item: any }>;
  };

  const totalItems = days.reduce((s: number, d: any) => s + toItems(d?.slots).length, 0);

  console.log(`✅ 草案生成成功 (${elapsed}ms)`);
  console.log(`  候选数: ${draft?.candidatesCount ?? 'N/A'}`);
  console.log(`  行程天数: ${days.length}`);
  console.log(`  行程项总数: ${totalItems}`);
  console.log(`  LLM Provider: ${draft?.metadata?.llmProvider ?? 'N/A'}`);

  if (draft?.validationWarnings?.length) {
    console.log(`  校验警告: ${draft.validationWarnings.length} 条`);
    draft.validationWarnings.slice(0, 3).forEach((w: string) => console.log(`    - ${w}`));
  }

  for (let i = 0; i < Math.min(days.length, 3); i++) {
    const d = days[i];
    const items = toItems(d?.slots);
    console.log(`\n  Day ${i + 1} (${d?.date ?? 'N/A'}): ${items.length} 项`);
    items.slice(0, 4).forEach(({ slot, item }: { slot: string; item: any }, j: number) => {
      const name = item?.place?.nameCN || item?.place?.nameEN || item?.placeId || '?';
      console.log(`    ${j + 1}. [${slot}] ${name}`);
    });
    if (items.length > 4) console.log(`    ... 等共 ${items.length} 项`);
  }

  console.log('\nTravel World Model E2E 验证通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
