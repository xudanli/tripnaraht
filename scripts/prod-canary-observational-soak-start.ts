#!/usr/bin/env npx tsx
/**
 * Mark observational soak start (non-sign-off) on current Open-Meteo fallback config.
 *
 * Usage: npx tsx scripts/prod-canary-observational-soak-start.ts
 */
import { writeFileSync } from 'fs';

const evidence = {
  evidenceType: 'PRODUCTION_CANARY_OBSERVATIONAL_SOAK',
  soakMode: 'OBSERVATIONAL_SOAK',
  signoffEligible: false,
  weatherAuthority: 'open_meteo_fallback',
  startedAt: new Date().toISOString(),
  tripId: 'a0a99999-9999-4999-8999-999999999999',
  database: 'tripnara_prod',
  note:
    'Non-signoff soak on existing monitoring/cron. Does NOT satisfy Production Canary GO. Formal 24h soak runs after VEDUR_LIVE collector path is live.',
  watchItems: [
    'cron_miss',
    'advisory_lock_stuck',
    'memory_growth',
    'db_connection_leak',
    'fingerprint_duplicate',
    'provider_transition_anomaly',
    'legacy_write_nonzero',
    'queue_pollution',
  ],
};

const out = `internal-docs/operations/evidence/observational-soak-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
console.log(`\nWritten: ${out}`);
console.log('\nObservational soak STARTED (SIGNOFF_ELIGIBLE=false)');
