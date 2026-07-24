#!/usr/bin/env npx tsx
const BASE = process.env.API_BASE || 'http://localhost:3000';
const tripId = process.env.TRIP_ID || 'b950dbf2-7583-4b43-b0c6-ddd947719c54';
const sessionId = `test-day2-hotel-${Date.now()}`;
const msg = '第二天的行程给我推荐酒店，并且最好离第三天的行程要近';
const ctx = { tripId, countryCode: 'IS' };

async function testPaChat() {
  const r = await fetch(`${BASE}/api/agent/planning-assistant/v2/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message: msg, language: 'zh', context: ctx }),
  });
  const d = await r.json();
  console.log('=== PA v2 chat ===');
  console.log('status', r.status);
  console.log('phase', d.phase);
  console.log('messageCN', (d.messageCN || d.replyCN || '').slice(0, 300));
  console.log('clarification', d.clarificationNeeded?.type, d.clarificationNeeded?.suggestedDates);
  console.log('accommodations', (d.accommodations || []).length);
}

async function testRouteAndRun() {
  const r = await fetch(`${BASE}/api/agent/route_and_run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: `test-${Date.now()}`,
      message: msg,
      trip_id: tripId,
      options: { max_seconds: 90 },
    }),
  });
  const d = await r.json();
  console.log('=== route_and_run ===');
  console.log('status', r.status);
  console.log('result.status', d.result?.status);
  console.log('answer', (d.result?.answer_text || '').slice(0, 300));
  console.log('accommodations', (d.result?.payload?.accommodations || []).length);
}

async function main() {
  await testPaChat();
  await testRouteAndRun();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
