#!/usr/bin/env npx tsx
/**
 * 三人格相关 HTTP 接口冒烟测试
 * 用法: npx tsx scripts/test-guardian-persona-apis-http.ts
 */
export {};

const BASE = process.env.API_URL || 'http://localhost:3000';
const TRIP_ID =
  process.env.TEST_TRIP_ID || 'c7201f41-bb9f-4961-9512-1c98d9d301e2';
const FALLBACK_TRIP_ID = '7891922b-f0cf-4b1d-90f3-89a259325fa0';

interface Result {
  name: string;
  method: string;
  path: string;
  status: number | 'ERR';
  ok: boolean;
  note?: string;
  sample?: unknown;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 90000,
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

function icon(ok: boolean, status: number | 'ERR') {
  if (ok) return '✅';
  if (status === 401) return '🔒';
  if (status === 404) return '⚠️';
  return '❌';
}

function summarizeNegotiation(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const d = (data as any).decision ?? data;
  const parts: string[] = [];
  if (d.decision) parts.push(`decision=${d.decision}`);
  if (d.consensusLevel != null) parts.push(`consensus=${Number(d.consensusLevel).toFixed(2)}`);
  const evals = d.evaluations ?? d.personaEvaluations;
  if (Array.isArray(evals)) {
    parts.push(
      `personas=${evals.map((e: any) => e.persona ?? e.personaLabel).join('/')}`,
    );
  }
  return parts.join(', ');
}

function summarizeAlerts(data: any): string {
  const list = data?.data ?? data;
  if (!Array.isArray(list)) return '';
  const personas = [...new Set(list.map((a: any) => a.persona))];
  return `${list.length} alerts, personas: ${personas.join(', ') || 'none'}`;
}

async function main() {
  console.log(`\n🎭 三人格接口 HTTP 测试\nBASE=${BASE}\nTRIP_ID=${TRIP_ID}\n`);

  try {
    const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`health ${health.status}`);
    console.log('✅ 服务器健康检查通过\n');
  } catch (e: any) {
    console.error(`❌ 无法连接服务器: ${e.message}`);
    console.error('请先启动: npx ts-node --transpile-only -r tsconfig-paths/register src/main.ts');
    process.exit(1);
  }

  const results: Result[] = [];

  // 1. 三人格博弈（公开测试端点）
  {
    const path = '/api/v2/user/optimization/test/negotiation';
    let r = await req('POST', path, { tripId: TRIP_ID });
    if (!r.ok && TRIP_ID !== FALLBACK_TRIP_ID) {
      r = await req('POST', path, { tripId: FALLBACK_TRIP_ID });
    }
    results.push({
      name: '三人格博弈协商',
      method: 'POST',
      path,
      status: r.status,
      ok: r.ok,
      note: summarizeNegotiation(r.data),
      sample: r.ok ? pickKeys(r.data, ['decision', 'consensusLevel', 'votingResult', 'conditions']) : (r.data as any)?.message,
    });
  }

  // 2. 三人格顺序编排（mock plan + world）
  {
    const path = '/api/v2/user/optimization/test/negotiation';
    const mockPlan = {
      tripId: 'guardian-smoke-trip',
      routeDirectionId: 'default',
      segments: [{ segmentId: 's1', dayIndex: 1, distanceKm: 120, ascentM: 200, slopePct: 5 }],
    };
    const mockWorld = {
      physical: {
        month: 6,
        climate: { accessibilityScore: 0.75 },
        weather: { temperature: 12, windSpeed: 15, precipitation: 0.2 },
        terrain: { elevation: 400, gradient: 8 },
        hazards: [],
      },
      human: {
        fitnessLevel: 'INTERMEDIATE',
        currentFatigue: 0.35,
        maxDailyAscentM: 600,
        riskTolerance: 0.4,
      },
      routeDirection: {
        id: 'smoke-route',
        philosophy: { scenic: true, challenging: true },
        constraints: { maxDailyDrivingHours: 6 },
      },
    };
    const r = await req('POST', path, { plan: mockPlan, world: mockWorld });
    results.push({
      name: '三人格博弈（mock plan）',
      method: 'POST',
      path,
      status: r.status,
      ok: r.ok,
      note: summarizeNegotiation(r.data),
    });
  }

  // 3. Persona 触发统计
  {
    const path = '/api/decision-stats/by-persona';
    const r = await req('GET', path);
    results.push({
      name: '三人格触发频次统计',
      method: 'GET',
      path,
      status: r.status,
      ok: r.ok,
      note: r.ok ? JSON.stringify(r.data).slice(0, 120) : String((r.data as any)?.message ?? ''),
    });
  }

  // 4. Readiness 博弈快照
  {
    const path = `/api/readiness/trip/${TRIP_ID}/guardian-negotiation`;
    const r = await req('GET', path);
    const snapshot = (r.data as any)?.data?.snapshot;
    results.push({
      name: 'Readiness 博弈快照',
      method: 'GET',
      path,
      status: r.status,
      ok: r.ok,
      note: snapshot ? '有快照' : 'snapshot=null（尚未跑过 apply-repair 博弈）',
    });
  }

  // 5. Persona Alerts
  {
    const path = `/api/trips/${TRIP_ID}/persona-alerts`;
    const r = await req('GET', path);
    results.push({
      name: '三人格提醒列表',
      method: 'GET',
      path,
      status: r.status,
      ok: r.ok,
      note: r.ok ? summarizeAlerts(r.data) : String((r.data as any)?.message ?? ''),
      sample: r.ok ? ((r.data as any)?.data ?? r.data)?.slice?.(0, 2) : undefined,
    });
  }

  // 6. Trip suggestions（整合三人格）
  {
    const path = `/api/trips/${TRIP_ID}/suggestions`;
    const r = await req('GET', path);
    results.push({
      name: '行程建议（含三人格）',
      method: 'GET',
      path,
      status: r.status,
      ok: r.ok,
      note: r.ok
        ? `${Array.isArray((r.data as any)?.data) ? (r.data as any).data.length : '?'} suggestions`
        : String((r.data as any)?.message ?? ''),
    });
  }

  // 输出
  console.log('─'.repeat(72));
  for (const r of results) {
    console.log(`${icon(r.ok, r.status)} [${r.status}] ${r.method} ${r.path}`);
    console.log(`   ${r.name}${r.note ? ` — ${r.note}` : ''}`);
    if (r.sample) {
      console.log(`   sample: ${JSON.stringify(r.sample).slice(0, 200)}`);
    }
  }
  console.log('─'.repeat(72));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n📊 ${passed}/${results.length} 通过\n`);

  if (passed < results.length) process.exit(1);
}

function pickKeys(obj: unknown, keys: string[]) {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in (obj as object)) out[k] = (obj as any)[k];
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
