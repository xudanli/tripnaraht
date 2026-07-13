#!/usr/bin/env npx tsx
/**
 * Start formal 24h Vedur authority soak (sign-off eligible when complete).
 *
 * Prerequisites:
 *   - PM2 stack running (install-devbox-collector-pm2.sh)
 *   - Frankfurt cron installed (install-frankfurt-collector-cron.sh)
 *
 * Usage: npx tsx scripts/prod-canary-formal-vedur-soak-start.ts
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';
const SOAK_HOURS = 24;
const FRANKFURT_HOST = process.env.FRANKFURT_HOST ?? 'root@47.87.131.183';

function check(label: string, cmd: string): { ok: boolean; detail: string } {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
    return { ok: true, detail: out.slice(0, 200) || 'ok' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 200) };
  }
}

const startedAt = new Date();
const endsAt = new Date(startedAt.getTime() + SOAK_HOURS * 60 * 60 * 1000);

const preflight = {
  devboxIngest: check('devboxIngest', 'curl -4 -sS --max-time 5 http://127.0.0.1:3000/health'),
  frankfurtTunnel: check(
    'frankfurtTunnel',
    `ssh -o BatchMode=yes -o ConnectTimeout=8 ${FRANKFURT_HOST} 'curl -4 -sS --max-time 8 http://127.0.0.1:19080/health'`,
  ),
  frankfurtCron: check(
    'frankfurtCron',
    `ssh -o BatchMode=yes -o ConnectTimeout=8 ${FRANKFURT_HOST} 'crontab -l | grep -E "run-vedur-collector-cron|vedur-collector-minimal"'`,
  ),
};

const preflightPass = Object.values(preflight).every((p) => p.ok);

const evidence = {
  evidenceType: 'PRODUCTION_CANARY_FORMAL_VEDUR_SOAK',
  soakMode: 'FORMAL_24H_VEDUR_AUTHORITY',
  signoffEligible: false,
  signoffEligibleAfter: endsAt.toISOString(),
  weatherAuthority: 'vedur_live_collector',
  startedAt: startedAt.toISOString(),
  endsAt: endsAt.toISOString(),
  soakDurationHours: SOAK_HOURS,
  tripId: CANARY_TRIP_ID,
  database: 'tripnara_prod',
  collectorHost: '47.87.131.183',
  devboxIngestPort: 3000,
  frankfurtTunnelPort: 19080,
  cronSchedule: '*/15 * * * *',
  preflight,
  preflightPass,
  status: preflightPass ? 'RUNNING' : 'START_BLOCKED',
  watchItems: [
    'cron_miss',
    'tunnel_disconnect',
    'ingest_server_restart_storm',
    'advisory_lock_stuck',
    'memory_growth',
    'db_connection_leak',
    'fingerprint_duplicate',
    'provider_transition_anomaly',
    'legacy_write_nonzero',
    'vedur_ingest_http_non_200',
  ],
  completionCriteria: [
    '24h elapsed with preflightPass true at start',
    'Frankfurt cron ran ~96 times (15min interval) with >=95% success',
    'No sustained tunnel outage >15min',
    'trip metadata rfc001VedurWeatherEvidence polls show INGESTED/UNCHANGED',
    'No provider_transition_anomaly (Open-Meteo must not override active Vedur risk)',
  ],
  note:
    'Formal sign-off soak on VEDUR_LIVE collector path. Does NOT require app launch or real user traffic. Run prod-canary-formal-vedur-soak-check.ts after endsAt.',
};

const out = `internal-docs/operations/evidence/formal-vedur-soak-${startedAt.toISOString().slice(0, 10)}.json`;
writeFileSync(out, JSON.stringify(evidence, null, 2));

console.log(JSON.stringify(evidence, null, 2));
console.log(`\nWritten: ${out}`);

if (!preflightPass) {
  console.error('\n=== FORMAL_SOAK_START_BLOCKED — fix preflight failures ===');
  process.exit(1);
}

console.log(`\n=== FORMAL_VEDUR_SOAK STARTED ===`);
console.log(`Ends at: ${endsAt.toISOString()} (${SOAK_HOURS}h)`);
console.log(`Check after endsAt: npm run prod-canary:formal-vedur-soak-check`);
