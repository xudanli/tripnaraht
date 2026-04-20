/**
 * 可选 HTTP 验收：需 API 已启动且进程环境含
 *   HARNESS_RECORD_TRACE=1
 *   HARNESS_TRACE_EXPORT_DIR=artifacts/trace
 *
 * 运行：
 *   RUN_ROUTE_AND_RUN_TRACE_ACCEPTANCE=1 TRIPNARA_API_BASE=http://127.0.0.1:3000 npx jest scripts/lib/route-and-run-trace-eval.acceptance.spec.ts
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { traceRefFromRouteAndRunObservability, type HarnessObservabilitySlice } from './evaluation-harness-report-refs';

const enabled = process.env.RUN_ROUTE_AND_RUN_TRACE_ACCEPTANCE === '1';
const base = process.env.TRIPNARA_API_BASE?.trim();

const d = enabled && base ? describe : describe.skip;

d('route_and_run trace export acceptance (HTTP)', () => {
  jest.setTimeout(180_000);

  it('observability.harness_trace_export_path set and traceRefs.path maps to existing file', async () => {
    const runId = randomUUID();
    const requestId = `trace-acc-${Date.now()}`;
    const caseId = requestId;
    const url = `${base!.replace(/\/+$/, '')}/api/agent/route_and_run`;
    const token = process.env.TRIPNARA_API_TOKEN?.trim();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        request_id: requestId,
        user_id: 'eval-trace-user',
        message:
          'Plan a minimal 2-day trip to Reykjavik for one traveler. Keep the answer short; focus on having a valid itinerary structure.',
        meta: { run_id: runId },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          max_seconds: Math.min(120, Number(process.env.EVAL_ROUTE_AND_RUN_MAX_SECONDS ?? 120)),
          max_steps: 8,
        },
      }),
    });

    expect(res.ok).toBe(true);
    const json = (await res.json()) as Record<string, unknown>;
    const obs = json.observability as HarnessObservabilitySlice | undefined;
    expect(typeof obs?.harness_trace_export_path).toBe('string');
    const p = String(obs!.harness_trace_export_path).trim();
    expect(p.length).toBeGreaterThan(0);

    const ref = traceRefFromRouteAndRunObservability(caseId, runId, obs);
    expect(ref.path && ref.path.trim().length).toBeGreaterThan(0);

    const abs = path.isAbsolute(ref.path!) ? ref.path! : path.join(process.cwd(), ref.path!);
    expect(fs.existsSync(abs)).toBe(true);
  });
});
