#!/usr/bin/env npx tsx
/**
 * Vedur Collector Feasibility Spike — run on a candidate host that may reach 130.208.87.200:443.
 *
 * Usage:
 *   npx tsx scripts/vedur-collector-feasibility-spike.ts
 *   npx tsx scripts/vedur-collector-feasibility-spike.ts --write-evidence --collector-candidate=eu-west-1a
 *
 * Pass criteria: TCP + TLS + HTTP 200 + valid Vedur XML + stability probes.
 */
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { lookup } from 'dns/promises';
import * as https from 'https';
import * as tls from 'tls';

const VEDUR_HOST = 'xmlweather.vedur.is';
const VEDUR_API =
  'https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids=1';
const STABILITY_RUNS = 3;
const STABILITY_GAP_MS = 2000;

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
  ms?: number;
}

const steps: StepResult[] = [];

function record(step: string, ok: boolean, detail: string, ms?: number) {
  steps.push({ step, ok, detail, ms });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step}: ${detail}${ms != null ? ` (${ms}ms)` : ''}`);
}

function getEgressIp(): string {
  try {
    return execSync('curl -4 -sS --connect-timeout 8 --max-time 12 https://api.ipify.org', {
      encoding: 'utf8',
    }).trim();
  } catch {
    try {
      return execSync('curl -4 -sS --connect-timeout 8 --max-time 12 https://ifconfig.me/ip', {
        encoding: 'utf8',
      }).trim();
    } catch {
      return 'unknown';
    }
  }
}

async function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = tls.connect({ host, port, servername: host, timeout: timeoutMs }, () => {
      record('TLS-handshake', true, `cipher=${socket.getCipher()?.name ?? 'unknown'}`, Date.now() - t0);
      socket.end();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      record('TLS-handshake', false, 'timeout', Date.now() - t0);
      resolve(false);
    });
    socket.on('error', (e) => {
      record('TLS-handshake', false, e.message, Date.now() - t0);
      resolve(false);
    });
  });
}

async function fetchVedurXml(): Promise<{ ok: boolean; body: string; ms: number; status?: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = https.get(
      VEDUR_API,
      {
        timeout: 30000,
        headers: {
          'User-Agent': 'TripNARA-VedurCollectorSpike/1.0',
          Accept: 'application/xml,text/xml,*/*',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          resolve({
            ok: (res.statusCode ?? 0) === 200 && body.includes('<station'),
            body,
            ms: Date.now() - t0,
            status: res.statusCode,
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, body: '', ms: Date.now() - t0 });
    });
    req.on('error', () => resolve({ ok: false, body: '', ms: Date.now() - t0 }));
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const candidate = process.argv.find((a) => a.startsWith('--collector-candidate='))?.split('=')[1]
    ?? process.env.VEDUR_COLLECTOR_CANDIDATE_REGION
    ?? 'unspecified';

  console.log(`Vedur Collector Feasibility Spike (candidate=${candidate})\n`);

  const egressIp = getEgressIp();
  record('collector-egress-ip', egressIp !== 'unknown', egressIp);

  try {
    const addrs = await lookup(VEDUR_HOST, { family: 4, all: true });
    record('DNS-A', true, addrs.map((a) => a.address).join(', '));
  } catch (e) {
    record('DNS-A', false, e instanceof Error ? e.message : String(e));
  }

  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'].filter((k) => process.env[k]);
  record('proxy-env', proxyVars.length === 0, proxyVars.join('; ') || 'none');

  try {
    execSync(`timeout 12 bash -c 'echo | nc -w10 ${VEDUR_HOST} 443'`, { stdio: 'pipe' });
    record('TCP-443', true, 'connected');
  } catch {
    record('TCP-443', false, 'connect timeout or refused');
  }

  const tlsOk = await tcpProbe(VEDUR_HOST, 443, 15000);
  if (!tlsOk) {
    console.warn('TLS failed — skipping HTTP stability probes');
  }

  const stability: Array<{ run: number; ok: boolean; ms: number; sha256: string; bytes: number }> = [];
  let sampleXml = '';

  for (let i = 0; i < STABILITY_RUNS; i += 1) {
    const res = await fetchVedurXml();
    const sha256 = createHash('sha256').update(res.body).digest('hex');
    stability.push({
      run: i + 1,
      ok: res.ok,
      ms: res.ms,
      sha256,
      bytes: res.body.length,
    });
    record(`HTTP-XML-run-${i + 1}`, res.ok, `status=${res.status ?? 'n/a'} bytes=${res.body.length} sha256=${sha256.slice(0, 12)}…`, res.ms);
    if (res.ok && !sampleXml) sampleXml = res.body.slice(0, 4000);
    if (i < STABILITY_RUNS - 1) await sleep(STABILITY_GAP_MS);
  }

  const httpPass = stability.every((s) => s.ok);
  const msP50 = stability.map((s) => s.ms).sort((a, b) => a - b)[Math.floor(stability.length / 2)] ?? 0;
  const spikePass = steps.some((s) => s.step === 'TCP-443' && s.ok)
    && tlsOk
    && httpPass;

  const evidence = {
    evidenceType: 'VEDUR_COLLECTOR_FEASIBILITY_SPIKE',
    probedAt: new Date().toISOString(),
    collectorCandidate: candidate,
    collectorEgressIp: egressIp,
    vedurHost: VEDUR_HOST,
    vedurApiUrl: VEDUR_API,
    spikePass,
    failureStage: !steps.find((s) => s.step === 'TCP-443')?.ok
      ? 'TCP'
      : !tlsOk
        ? 'TLS'
        : !httpPass
          ? 'HTTP'
          : 'none',
    stability: {
      runs: STABILITY_RUNS,
      gapMs: STABILITY_GAP_MS,
      allPass: httpPass,
      latencyMsP50: msP50,
      samples: stability,
    },
    sampleXmlPreview: sampleXml,
    sampleXmlSha256: sampleXml ? createHash('sha256').update(sampleXml).digest('hex') : undefined,
    ipRestrictionObserved: spikePass ? 'unknown — requires multi-region comparison' : 'likely — devbox cannot reach 130.208.87.200',
    recommendedPollIntervalMinutes: 15,
    nextStep: spikePass
      ? 'Implement minimal Collector + POST /internal/evidence/weather/vedur'
      : 'Try another candidate region/host; if all fail, reassess Vedur as production authority',
    steps,
  };

  console.log('\n=== Spike verdict ===');
  console.log(spikePass ? 'SPIKE_PASS — Collector path feasible on this host' : 'SPIKE_FAIL — try another candidate host');

  if (process.argv.includes('--write-evidence')) {
    const suffix = candidate.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    const out = `internal-docs/operations/evidence/vedur-collector-feasibility-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);
  }

  process.exit(spikePass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
