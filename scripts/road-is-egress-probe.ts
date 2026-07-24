#!/usr/bin/env npx tsx
/**
 * Road.is egress probe — DNS / TCP / TLS / HTTP staged checks.
 *
 * Read-only. Does NOT modify Formal Weather Soak or Production Canary.
 *
 * Usage:
 *   npx tsx scripts/road-is-egress-probe.ts
 *   npx tsx scripts/road-is-egress-probe.ts --write-evidence
 *   npx tsx scripts/road-is-egress-probe.ts --write-evidence --candidate=de-frankfurt
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import * as https from 'https';
import { lookup } from 'dns/promises';

const ROAD_IS_API_HOST = 'api.road.is';
const ROAD_IS_WWW_HOST = 'www.road.is';
const ROAD_IS_CONDITION_URL = 'https://api.road.is/api/condition';
const CANARY_ROAD_ID = process.env.ROAD_IS_PROBE_ROAD ?? 'F208';
const OPEN_METEO_CONTROL =
  'https://api.open-meteo.com/v1/forecast?latitude=64.15&longitude=-21.94&current=wind_speed_10m';

interface ProbeResult {
  name: string;
  ok: boolean;
  stage?: 'DNS' | 'TCP' | 'TLS' | 'HTTP' | 'NODE' | 'PARSE';
  detail: string;
  ms?: number;
}

const results: ProbeResult[] = [];

function record(
  name: string,
  ok: boolean,
  detail: string,
  stage?: ProbeResult['stage'],
  ms?: number,
) {
  results.push({ name, ok, stage, detail, ms });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}${ms != null ? ` (${ms}ms)` : ''}`);
}

function curlProbe(
  name: string,
  url: string,
  connectTimeout = 10,
  maxTime = 30,
  saveBodyPath?: string,
): string | undefined {
  const t0 = Date.now();
  const bodyOut = saveBodyPath ?? '/dev/null';
  try {
    const out = execSync(
      `curl -4 -sS -o "${bodyOut}" -w "code=%{http_code} connect=%{time_connect} tls=%{time_appconnect} total=%{time_total} bytes=%{size_download}" --connect-timeout ${connectTimeout} --max-time ${maxTime} "${url}"`,
      { encoding: 'utf8', timeout: (maxTime + 5) * 1000 },
    );
    const ms = Date.now() - t0;
    const codeMatch = out.match(/code=(\d+)/);
    const code = codeMatch ? Number(codeMatch[1]) : 0;
    const bytesMatch = out.match(/bytes=(\d+)/);
    const bytes = bytesMatch ? Number(bytesMatch[1]) : 0;
    const ok = code === 200 && bytes > 0;
    record(name, ok, out.trim(), ok ? 'HTTP' : code > 0 ? 'HTTP' : 'TCP', ms);
    if (saveBodyPath) {
      try {
        return execSync(`cat "${saveBodyPath}"`, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
      } catch {
        return undefined;
      }
    }
    return undefined;
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    const stage: ProbeResult['stage'] =
      msg.includes('Timeout') || msg.includes('timed out')
        ? 'TCP'
        : msg.includes('SSL') || msg.includes('TLS')
          ? 'TLS'
          : 'HTTP';
    record(name, false, msg.split('\n')[0] ?? msg, stage, ms);
    return undefined;
  }
}

function nodeHttpsProbe(name: string, url: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'TripNARA/1.0 (+https://tripnara.com)' } },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c.toString();
        });
        res.on('end', () => {
          record(
            name,
            (res.statusCode ?? 0) === 200 && body.length > 0,
            `status=${res.statusCode} bytes=${body.length}`,
            'NODE',
            Date.now() - t0,
          );
          resolve();
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      record(name, false, 'node_timeout', 'NODE', Date.now() - t0);
      resolve();
    });
    req.on('error', (e) => {
      record(name, false, `${e.code ?? 'error'}: ${e.message}`, 'NODE', Date.now() - t0);
      resolve();
    });
  });
}

function parseRoadIsSample(body: string | undefined, roadId: string): void {
  if (!body?.trim()) {
    record('parse-road-is-json', false, 'empty_body', 'PARSE');
    return;
  }
  try {
    const parsed = JSON.parse(body) as {
      results?: Array<{
        road_number?: string;
        status?: string;
        last_updated?: string;
      }>;
    };
    const row = parsed.results?.find((r) => r.road_number === roadId) ?? parsed.results?.[0];
    if (!row?.road_number || !row.status) {
      record(
        'parse-road-is-json',
        false,
        `missing results[].road_number/status — keys=${Object.keys(parsed).join(',')}`,
        'PARSE',
      );
      return;
    }
    record(
      'parse-road-is-json',
      true,
      `road=${row.road_number} status=${row.status} updated=${row.last_updated ?? 'n/a'}`,
      'PARSE',
    );
  } catch (e) {
    record('parse-road-is-json', false, e instanceof Error ? e.message : String(e), 'PARSE');
  }
}

async function resolveEgressIp(): Promise<string> {
  try {
    return execSync('curl -4 -sS --connect-timeout 8 --max-time 12 https://api.ipify.org', {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  const candidate = process.argv.find((a) => a.startsWith('--candidate='))?.split('=')[1] ?? 'devbox';
  const samplePath = `/tmp/road-is-probe-${candidate}-${Date.now()}.json`;

  console.log(`Road.is egress probe (candidate=${candidate})\n`);

  const egressIp = await resolveEgressIp();
  record('egress-ip', egressIp !== 'unknown', egressIp);

  for (const host of [ROAD_IS_API_HOST, ROAD_IS_WWW_HOST]) {
    try {
      const records = await lookup(host, { family: 4, all: true });
      record(`DNS-${host}`, true, records.map((r) => r.address).join(', '), 'DNS');
    } catch (e) {
      record(`DNS-${host}`, false, e instanceof Error ? e.message : String(e), 'DNS');
    }
  }

  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']
    .filter((k) => process.env[k])
    .map((k) => `${k}=${process.env[k]}`);
  record('PROXY-env', proxyVars.length === 0, proxyVars.length ? proxyVars.join('; ') : 'none set');

  try {
    const t0 = Date.now();
    execSync(`timeout 12 bash -c 'echo | nc -w10 ${ROAD_IS_API_HOST} 443'`, { encoding: 'utf8' });
    record('tcp-443-api', true, 'connected', 'TCP', Date.now() - t0);
  } catch (e) {
    record(
      'tcp-443-api',
      false,
      e instanceof Error ? e.message.split('\n')[0] : String(e),
      'TCP',
    );
  }

  curlProbe('curl-www-road-is', `https://${ROAD_IS_WWW_HOST}/`);
  curlProbe('curl-open-meteo-control', OPEN_METEO_CONTROL, 10, 15);

  const f208Url = `${ROAD_IS_CONDITION_URL}?road=${encodeURIComponent(CANARY_ROAD_ID)}`;
  const body = curlProbe('curl-api-condition-f208', f208Url, 10, 30, samplePath);
  parseRoadIsSample(body, CANARY_ROAD_ID);

  await nodeHttpsProbe('node-api-condition-f208', f208Url);

  const roadIsLivePass = results.some((r) => r.name === 'curl-api-condition-f208' && r.ok);
  const parsePass = results.some((r) => r.name === 'parse-road-is-json' && r.ok);
  const openMeteoPass = results.some((r) => r.name === 'curl-open-meteo-control' && r.ok);
  const failureStage =
    results.find((r) => r.name.startsWith('DNS-') && !r.ok)?.stage ??
    results.find((r) => r.name === 'curl-api-condition-f208' && !r.ok)?.stage ??
    'unknown';

  const diagnosis = roadIsLivePass
    ? parsePass
      ? `Road.is API reachable from ${candidate}; ${CANARY_ROAD_ID} JSON shape matches adapter expectations.`
      : `Road.is HTTP 200 but JSON shape mismatch — adapter alignment required before LIVE.`
    : failureStage === 'DNS'
      ? `DNS resolution failure for api.road.is / road.is — egress or resolver block. Slice 2 stays REPLAY_ONLY; consider Frankfurt collector spike (like Vedur Scheme A).`
      : failureStage === 'TCP'
        ? `TCP connect timeout to ${ROAD_IS_API_HOST}:443 — egress/firewall block.`
        : failureStage === 'TLS'
          ? 'TLS handshake failure — check certificate chain or middlebox.'
          : 'HTTP failure — check API availability or rate limits.';

  const evidence = {
    evidenceType: 'ROAD_IS_EGRESS_INVESTIGATION',
    probedAt: new Date().toISOString(),
    collectorCandidate: candidate,
    collectorEgressIp: egressIp,
    apiHost: ROAD_IS_API_HOST,
    conditionUrl: ROAD_IS_CONDITION_URL,
    canaryRoadId: CANARY_ROAD_ID,
    environment: candidate === 'devbox' ? 'production-canary-devbox' : candidate,
    roadIsLivePass: roadIsLivePass && parsePass,
    roadIsHttpPass: roadIsLivePass,
    adapterShapePass: parsePass,
    openMeteoControlPass: openMeteoPass,
    failureStage,
    diagnosis,
    recommendedPath: roadIsLivePass && parsePass
      ? 'ROAD_IS_LIVE — devbox direct poll viable; no collector required for Slice 2'
      : roadIsLivePass
        ? 'ROAD_IS_HTTP_ONLY — fix adapter/parse before LIVE'
        : 'ROAD_IS_EGRESS_NO-GO — replay-only until egress PASS (consider Frankfurt collector spike)',
    authorityPolicy: {
      ROAD_IS_LIVE: 'create / upgrade / recover road FEASIBILITY_FAILURE',
      SEASONAL_FALLBACK: 'assist only; cannot alone sign-off Slice 2 Canary',
      REAL_SHAPE_REPLAY: 'staging/canary drill until LIVE PASS',
      ROAD_IS_PROVIDER_MOCK: 'dev/test only — forbidden for sign-off',
    },
    statusLabels: {
      liveRoadIngestion: roadIsLivePass && parsePass ? 'GO (direct egress)' : 'NO-GO',
      replayOnlySlice2: !(roadIsLivePass && parsePass),
    },
    slice2Blockers: [
      !(roadIsLivePass && parsePass) ? 'egress_or_parse' : null,
      'no_road_fingerprint',
      'no_raw_response_persistence',
      'no_prod_canary_road_drill',
    ].filter(Boolean),
    probes: results,
    sampleBodyPath: samplePath,
  };

  console.log('\n=== Diagnosis ===');
  console.log(diagnosis);
  console.log(`\nRoad.is LIVE: ${evidence.roadIsLivePass ? 'PASS' : 'NO-GO'}`);
  console.log(`Open-Meteo control: ${openMeteoPass ? 'PASS' : 'NO-GO'}`);

  if (process.argv.includes('--write-evidence')) {
    const out = `internal-docs/operations/evidence/road-is-egress-${candidate}-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);
  }

  process.exit(evidence.roadIsLivePass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
