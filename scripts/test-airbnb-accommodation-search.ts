#!/usr/bin/env npx tsx
/**
 * 测试 Airbnb 住宿搜索是否返回 accommodations 数据
 * 运行: npx tsx scripts/test-airbnb-accommodation-search.ts
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';

async function main() {
  const sessionId = `test-acc-${Date.now()}`;
  const ctx = { tripId: '7891922b-f0cf-4b1d-90f3-89a259325fa0', countryCode: 'IS' };

  console.log('=== Step 1: 搜索冰岛住宿（触发日期澄清）===\n');
  const r1 = await fetch(`${BASE}/api/agent/planning-assistant/v2/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      userId: '5872f534-4fdf-483d-9e5a-464d3f36935d',
      message: '搜索冰岛的住宿',
      language: 'zh',
      context: ctx,
    }),
  });
  const d1 = await r1.json();
  console.log('Status:', r1.status);
  console.log('Phase:', d1.phase);
  console.log('MessageCN:', d1.messageCN?.slice(0, 80) + '...');
  console.log('Has clarificationNeeded:', !!d1.clarificationNeeded);
  console.log('Has suggestedDates:', !!d1.clarificationNeeded?.suggestedDates);
  if (d1.clarificationNeeded?.suggestedDates) {
    console.log('Suggested:', d1.clarificationNeeded.suggestedDates);
  }

  console.log('\n=== Step 2: 确认日期（执行搜索）===\n');
  const r2 = await fetch(`${BASE}/api/agent/planning-assistant/v2/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      userId: '5872f534-4fdf-483d-9e5a-464d3f36935d',
      message: '好的',
      language: 'zh',
      context: ctx,
    }),
  });
  const d2 = await r2.json();
  console.log('Status:', r2.status);
  console.log('Phase:', d2.phase);
  console.log('MessageCN:', d2.messageCN);

  const acc = d2.accommodations || [];
  const hotels = d2.hotels || [];
  const airbnb = d2.airbnbListings || [];

  console.log('\n=== 住宿数据检查 ===\n');
  console.log('accommodations 数量:', acc.length);
  console.log('hotels 数量:', hotels.length);
  console.log('airbnbListings 数量:', airbnb.length);

  if (acc.length > 0) {
    console.log('\n✅ accommodations 有数据，首条:');
    const first = acc[0];
    console.log(JSON.stringify({ id: first.id, source: first.source, name: first.name, address: first.address, photoUrl: first.photoUrl, photos: first.photos?.length, rating: first.rating, price: first.price, url: first.url }, null, 2));
    const addr = (first.address || '').toLowerCase();
    const isIceland = addr.includes('iceland') || addr.includes('冰岛');
    const isUS = addr.includes('usa') || addr.includes('united states') || addr.includes('美国');
    console.log('地址包含 Iceland:', isIceland, '| 包含 US:', isUS);
  } else {
    console.log('\n❌ accommodations 为空');
    if (d2.messageCN?.includes('暂时不可用')) {
      console.log('原因: 酒店搜索失败（Airbnb 可能被 robots.txt 拦截，或 HotelDirectService 未配置）');
    }
  }

  if (hotels.length > 0) console.log('hotels 首条 name:', hotels[0].name);
  if (airbnb.length > 0) console.log('airbnbListings 首条 id:', airbnb[0].id);
}

main().catch((e) => {
  console.error('Error:', e.message);
  if (e.cause) console.error('Cause:', e.cause);
  process.exit(1);
});
