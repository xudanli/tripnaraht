#!/usr/bin/env npx tsx
/**
 * Vedur egress probe — run from Production Canary host.
 *
 * Usage:
 *   npx tsx scripts/vedur-egress-probe.ts
 *   npx tsx scripts/vedur-egress-probe.ts --write-evidence
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import * as https from 'https';
import { lookup } from 'dns/promises';

const VEDUR_XML_HOST = 'xmlweather.vedur.is';
const VEDUR_XML_IP = '130.208.87.200';
const VEDUR_WWW_HOST = 'www.vedur.is';
const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=64.15&longitude=-21.94&current=wind_speed_10m';

interface ProbeResult {
  name: string;
  ok: boolean;
  stage?: 'DNS' | 'TCP' | 'TLS' | 'HTTP' | 'NODE';
  detail: string;
  ms?: number;
}

const results: ProbeResult[] = [];

function record(name: string, ok: boolean, detail: string, stage?: ProbeResult['stage'], ms?: number) {
  results.push({ name, ok, stage, detail, ms });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}${ms != null ? ` (${ms}ms)` : ''}`);
}

function curlProbe(name: string, url: string, connectTimeout = 10, maxTime = 30): void {
  const t0 = Date.now();
  try {
    const out = execSync(
      `curl -4 -sS -o /dev/null -w "code=%{http_code} connect=%{time_connect} tls=%{time_appconnect} total=%{time_total}" --connect-timeout ${connectTimeout} --max-time ${maxTime} "${url}"`,
      { encoding: 'utf8', timeout: (maxTime + 5) * 1000 },
    );
    const ms = Date.now() - t0;
    const codeMatch = out.match(/code=(\d+)/);
    const code = codeMatch ? Number(codeMatch[1]) : 0;
    record(name, code > 0, out.trim(), code > 0 ? 'HTTP' : 'TCP', ms);
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    const stage: ProbeResult['stage'] = msg.includes('Timeout') || msg.includes('timed out')
      ? 'TCP'
      : msg.includes('SSL') || msg.includes('TLS')
        ? 'TLS'
        : 'HTTP';
    record(name, false, msg.split('\n')[0] ?? msg, stage, ms);
  }
}

function nodeHttpsProbe(name: string, url: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'TripNARA/1.0 (+https://tripnara.com)' } },
      (res) => {
        let len = 0;
        res.on('data', (c) => {
          len += c.length;
        });
        res.on('end', () => {
          record(name, true, `status=${res.statusCode} bytes=${len}`, 'NODE', Date.now() - t0);
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

async function main() {
  console.log('Vedur egress probe\n');

  try {
    const records = await lookup(VEDUR_XML_HOST, { family: 4, all: true });
    record('DNS-xmlweather', true, records.map((r) => r.address).join(', '), 'DNS');
  } catch (e) {
    record('DNS-xmlweather', false, e instanceof Error ? e.message : String(e), 'DNS');
  }

  try {
    const records = await lookup(VEDUR_WWW_HOST, { family: 4, all: true });
    record('DNS-www', true, records.map((r) => r.address).join(', '), 'DNS');
  } catch (e) {
    record('DNS-www', false, e instanceof Error ? e.message : String(e), 'DNS');
  }

  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']
    .filter((k) => process.env[k])
    .map((k) => `${k}=${process.env[k]}`);
  record('PROXY-env', proxyVars.length === 0, proxyVars.length ? proxyVars.join('; ') : 'none set');

  curlProbe(
    'curl-xmlweather-api',
    `https://${VEDUR_XML_HOST}/?op_w=xml&type=obs&lang=en&view=xml&ids=1`,
  );
  curlProbe('curl-xmlweather-base', `https://${VEDUR_XML_HOST}/`);
  curlProbe('curl-www-vedur', `https://${VEDUR_WWW_HOST}/`);
  curlProbe('curl-open-meteo-control', OPEN_METEO_URL, 10, 15);

  try {
    const t0 = Date.now();
    execSync(`timeout 12 bash -c 'echo | nc -w10 ${VEDUR_XML_HOST} 443'`, { encoding: 'utf8' });
    record('tcp-443-xmlweather', true, 'connected', 'TCP', Date.now() - t0);
  } catch (e) {
    record(
      'tcp-443-xmlweather',
      false,
      e instanceof Error ? e.message.split('\n')[0] : String(e),
      'TCP',
    );
  }

  await nodeHttpsProbe(
    'node-xmlweather-api',
    `https://${VEDUR_XML_HOST}/?op_w=xml&type=obs&lang=en&view=xml&ids=1`,
  );

  const vedurDirectPass = results.some((r) => r.name.startsWith('curl-xmlweather') && r.ok);
  const openMeteoPass = results.some((r) => r.name === 'curl-open-meteo-control' && r.ok);
  const failureStage =
    results.find((r) => r.name === 'curl-xmlweather-api' && !r.ok)?.stage ?? 'unknown';

  const diagnosis =
    failureStage === 'TCP'
      ? `TCP connect timeout to ${VEDUR_XML_IP}:443 — egress/firewall or destination IP allowlist. www.vedur.is uses different IP and may succeed.`
      : failureStage === 'TLS'
        ? 'TLS handshake failure — check IPv6 path or certificate chain.'
        : failureStage === 'DNS'
          ? 'DNS resolution failure.'
          : vedurDirectPass
            ? 'Vedur XML API reachable.'
            : 'HTTP layer failure after connect.';

  const evidence = {
    evidenceType: 'VEDUR_EGRESS_INVESTIGATION',
    probedAt: new Date().toISOString(),
    host: VEDUR_XML_HOST,
    targetIp: VEDUR_XML_IP,
    environment: 'production-canary-devbox',
    vedurDirectPass,
    openMeteoControlPass: openMeteoPass,
    failureStage,
    diagnosis,
    recommendedPath: vedurDirectPass
      ? 'VEDUR_LIVE — proceed to formal 24h soak on Vedur config'
      : 'Scheme A — Vedur collector/proxy reachable to 130.208.87.200; Open-Meteo remains OPEN_METEO_FALLBACK only',
    authorityPolicy: {
      VEDUR_LIVE: 'create / upgrade / recover weather risk',
      OPEN_METEO_FALLBACK: 'NO_ACTION + assist; cannot alone clear active Vedur high risk',
      REAL_SHAPE_REPLAY: 'canary/drill only',
    },
    statusLabels: {
      liveApiIngestion: openMeteoPass ? 'GO (fallback path)' : 'NO-GO',
      vedurAuthoritativeIngestion: vedurDirectPass ? 'GO' : 'NO-GO',
    },
    investigationDeadlineHours: 72,
    probes: results,
  };

  console.log('\n=== Diagnosis ===');
  console.log(diagnosis);
  console.log(`\nVedur direct: ${vedurDirectPass ? 'PASS' : 'NO-GO'}`);
  console.log(`Open-Meteo control: ${openMeteoPass ? 'PASS' : 'NO-GO'}`);

  if (process.argv.includes('--write-evidence')) {
    const out = `internal-docs/operations/evidence/vedur-egress-investigation-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);
  }

  process.exit(vedurDirectPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
