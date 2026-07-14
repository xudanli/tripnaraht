/**
 * Replay Planning Gold Dataset against OR-Tools sidecar (ADR-008 / Phase 0).
 * Does NOT promote authority.
 *
 *   OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091 npx tsx src/decision-runtime/solver/lab/gold/replay-gold-dataset.ts
 *   ... -- --stability 20
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../../../../../');
const GOLD = join(ROOT, 'src/decision-runtime/solver/lab/gold');
const BASE = (process.env.OR_TOOLS_SOLVER_URL ?? 'http://127.0.0.1:8091').replace(
  /\/$/,
  '',
);

type Scenario = {
  schemaId: string;
  scenarioId: string;
  status: string;
  seed?: number;
  stabilityRuns?: number;
  maxChangedActivities?: number;
  /** Booked / depot ids that must appear in every candidate day plan */
  requireNodeIds?: string[];
  solverProblemRef?: string;
  solverProblem?: Record<string, unknown>;
  operationOverride?: string;
};

type Manifest = {
  scenarios: Array<{ scenarioId: string; path: string; status: string }>;
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function candidateHash(resp: {
  candidates?: Array<{ dayPlans?: Array<{ dayId?: string; nodeIds?: string[] }> }>;
}): string {
  const orders = (resp.candidates ?? []).map((c) =>
    (c.dayPlans ?? [])
      .map((d) => `${d.dayId ?? '?'}:${(d.nodeIds ?? []).join('>')}`)
      .join(';'),
  );
  return createHash('sha256').update(orders.join('|')).digest('hex').slice(0, 16);
}

/** Touch count for Repair Locality: membership deltas + common-subsequence order diffs. */
function countChanged(base: string[], cand: string[]): number {
  const b = base.filter((x) => x !== 'depot');
  const c = cand.filter((x) => x !== 'depot');
  if (b.join('|') === c.join('|')) return 0;
  const setB = new Set(b);
  const setC = new Set(c);
  const removed = [...setB].filter((id) => !setC.has(id)).length;
  const added = [...setC].filter((id) => !setB.has(id)).length;
  const bi = b.filter((id) => setC.has(id));
  const ci = c.filter((id) => setB.has(id));
  let orderDiff = 0;
  const n = Math.max(bi.length, ci.length);
  for (let i = 0; i < n; i++) {
    if (bi[i] !== ci[i]) orderDiff += 1;
  }
  return removed + added + orderDiff;
}

async function solve(problem: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/v1/solve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(problem),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`solve HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main(): Promise<number> {
  const stabilityArg = process.argv.includes('--stability')
    ? Number(process.argv[process.argv.indexOf('--stability') + 1])
    : undefined;
  const matchArg = process.argv.includes('--match')
    ? String(process.argv[process.argv.indexOf('--match') + 1] ?? '')
    : '';
  const matchNeedles = matchArg
    ? matchArg.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const healthRes = await fetch(`${BASE}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!healthRes.ok) {
    console.error(`FAIL: health ${BASE}`);
    return 1;
  }
  const health = (await healthRes.json()) as {
    ok?: boolean;
    nativeCpSat?: boolean;
    moveDayShadowEnabled?: boolean;
  };
  if (health.ok !== true || health.nativeCpSat === true) {
    console.error('FAIL: health contract', health);
    return 1;
  }

  const manifest = loadJson<Manifest>(join(GOLD, 'manifest.v1.json'));
  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const entry of manifest.scenarios) {
    if (
      matchNeedles.length > 0 &&
      !matchNeedles.some((n) => entry.scenarioId.includes(n))
    ) {
      continue;
    }
    if (entry.status === 'stub' || entry.status === 'retired') {
      results.push({ scenarioId: entry.scenarioId, skipped: entry.status });
      continue;
    }
    const scen = loadJson<Scenario>(join(GOLD, entry.path));
    let problem: Record<string, unknown>;
    if (scen.solverProblem) {
      problem = { ...scen.solverProblem };
    } else if (scen.solverProblemRef) {
      problem = loadJson(join(ROOT, scen.solverProblemRef));
    } else {
      console.error(`FAIL ${scen.scenarioId}: no solverProblem`);
      failed += 1;
      continue;
    }
    problem.requestId = `gold:${scen.scenarioId}`;
    if (scen.operationOverride) problem.operation = scen.operationOverride;
    if (typeof scen.seed === 'number') {
      const cfg = (problem.solverConfig ?? {}) as Record<string, unknown>;
      problem.solverConfig = { ...cfg, seed: scen.seed };
    }

    if (problem.operation === 'MOVE_DAY' && !health.moveDayShadowEnabled) {
      console.log(
        `SKIP ${scen.scenarioId} MOVE_DAY (sidecar OR_TOOLS_MOVE_DAY_SHADOW off)`,
      );
      results.push({
        scenarioId: scen.scenarioId,
        skipped: 'move_day_flag_off',
      });
      continue;
    }

    // Base day order = visit nodes excluding REPLACE_POOL alternatives
    const replaceAltIds = new Set(
      ((problem.constraints as Array<{
        kind?: string;
        payload?: { toNodeId?: string };
      }>) ?? [])
        .filter((c) => c.kind === 'REPLACE_POOL')
        .map((c) => c.payload?.toNodeId)
        .filter((id): id is string => Boolean(id)),
    );
    const baseOrder = ((problem.nodes as Array<{ nodeId: string }>) ?? [])
      .map((n) => n.nodeId)
      .filter((id) => id !== 'depot' && !replaceAltIds.has(id));

    const runs = stabilityArg ?? scen.stabilityRuns ?? 1;
    const hashes: string[] = [];
    let last: Record<string, unknown> | null = null;
    let localityOk = true;
    let requireOk = true;
    let maxChanged = 0;

    // Auto-require booked visit nodes when not declared
    const requireIds =
      scen.requireNodeIds ??
      ((problem.nodes as Array<{ nodeId: string; isBooked?: boolean }>) ?? [])
        .filter((n) => n.isBooked && n.nodeId !== 'depot')
        .map((n) => n.nodeId);

    try {
      for (let i = 0; i < runs; i++) {
        const resp = await solve({
          ...problem,
          requestId: `gold:${scen.scenarioId}:${i}`,
        });
        last = resp;
        const meta = resp.solverMeta as {
          nativeCpSat?: boolean;
          engine?: string;
        } | undefined;
        if (
          meta?.nativeCpSat === true &&
          meta.engine === 'OR_TOOLS_ROUTING'
        ) {
          throw new Error(
            'nativeCpSat=true with OR_TOOLS_ROUTING (ADR-008 forbidden)',
          );
        }
        const status = String(resp.status);
        if (status === 'ERROR') throw new Error(`status=ERROR`);
        hashes.push(candidateHash(resp as never));
        const cands = (resp.candidates as Array<{
          dayPlans?: Array<{ nodeIds?: string[] }>;
          diffHint?: { movedDayPairs?: unknown[] };
        }>) ?? [];
        if (problem.operation === 'MOVE_DAY' && scen.maxChangedActivities != null) {
          const moved = cands[0]?.diffHint?.movedDayPairs?.length ?? 0;
          maxChanged = Math.max(maxChanged, moved);
          if (moved > scen.maxChangedActivities) localityOk = false;
        } else {
          const best = cands[0]?.dayPlans?.[0]?.nodeIds;
          if (best && scen.maxChangedActivities != null) {
            const ch = countChanged(baseOrder, best);
            maxChanged = Math.max(maxChanged, ch);
            if (ch > scen.maxChangedActivities) localityOk = false;
          }
        }
        if (requireIds.length && cands.length) {
          for (const cand of cands) {
            const ids = new Set(
              (cand.dayPlans ?? []).flatMap((d) => d.nodeIds ?? []),
            );
            if (requireIds.some((id) => !ids.has(id))) requireOk = false;
          }
        }
      }
    } catch (err) {
      console.error(
        `FAIL ${scen.scenarioId}:`,
        err instanceof Error ? err.message : err,
      );
      failed += 1;
      results.push({ scenarioId: scen.scenarioId, pass: false, error: String(err) });
      continue;
    }

    const stabilityOk = hashes.length > 0 && hashes.every((h) => h === hashes[0]);
    const pass = Boolean(last) && stabilityOk && localityOk && requireOk;
    if (!pass) failed += 1;
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${scen.scenarioId} runs=${runs} ` +
        `hash=${hashes[0]} locality=${localityOk} require=${requireOk} ` +
        `maxChanged=${maxChanged} status=${String(last?.status)}`,
    );
    results.push({
      scenarioId: scen.scenarioId,
      pass,
      stabilityOk,
      localityOk,
      requireOk,
      maxChanged,
      hash: hashes[0],
      status: last?.status,
      authoritativePromotion: false,
    });
  }

  const outDir = join(ROOT, 'artifacts/planning-gold-replay');
  mkdirSync(outDir, { recursive: true });
  const report = {
    schemaId: 'tripnara.planning_gold_replay@v1',
    authoritativePromotion: false,
    solverUrl: BASE,
    verdict: failed === 0 ? 'PASS' : 'FAIL',
    failed,
    results,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`verdict=${report.verdict} report=${outDir}/latest.json`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
